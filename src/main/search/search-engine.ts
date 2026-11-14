/**
 * `search_web` — a configurable, multi-engine search hub (TODO_RESEARCH_CRAWL.md §5, Feature 5).
 *
 * Each query is run in a **detached WebContentsView** (real Chromium, host fingerprint), so the
 * active tab is never hijacked and the SERP renders/consents exactly as it would for a human.
 * If an engine returns nothing — usually a bot-check or consent wall — the hub falls back to the
 * next engine in the chain without failing the agent turn.
 *
 * The `custom` engine (a URL template containing `{query}`, e.g. a SearXNG instance) makes the hub
 * testable offline and covers self-hosted search.
 */
export interface SearchResult {
  rank: number;
  title: string;
  url: string;
  snippet: string;
}

export interface SearchAttempt {
  engine: string;
  ok: boolean;
  count: number;
  blocked: boolean;
  error?: string;
}

export interface SearchOutcome {
  query: string;
  engine: string | null;
  results: SearchResult[];
  attempts: SearchAttempt[];
  blocked: boolean;
  notes: string;
}

export interface SearchHubDeps {
  load: (
    url: string,
    script: string,
    opts?: { timeoutMs?: number; settleMs?: number; readyScript?: string; readyMs?: number },
  ) => Promise<{ result: any; status: number; contentType: string | null }>;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
}

interface EngineSpec {
  id: string;
  label: string;
  build: (query: string) => string;
}

export const KNOWN_ENGINES = ['google', 'duckduckgo', 'bing', 'brave', 'startpage', 'custom'] as const;
/** Default fallback chain: JS-free, consent-resistant providers first; Google last (it challenges often). */
export const DEFAULT_ENGINE_CHAIN = ['duckduckgo', 'brave', 'google'];

function coded(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

/**
 * Generic SERP extractor. Prefers common result containers (DDG html, Bing, Google, Brave,
 * Startpage) and falls back to a link scan; unwraps Google `/url?q=` and DDG `/l/?uddg=` redirects.
 */
const EXTRACT_SCRIPT = `(() => {
  const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const unwrap = (href) => {
    try {
      const u = new URL(href);
      if (/(^|\\.)google\\./i.test(u.hostname) && u.pathname === '/url') { const q = u.searchParams.get('q'); if (q) return q; }
      if (/(^|\\.)duckduckgo\\.com$/i.test(u.hostname) && u.pathname === '/l/') { const t = u.searchParams.get('uddg'); if (t) return decodeURIComponent(t); }
      if (/(^|\\.)bing\\.com$/i.test(u.hostname) && u.pathname === '/ck/a') { const b = u.searchParams.get('u'); if (b) { try { return atob(b.replace(/^a1/, '')); } catch (e) {} } }
      return href;
    } catch (e) { return href; }
  };
  const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
  const hasResults = !!document.querySelector('.result, .b_algo, #search a h3, .g, .snippet, .w-gl__result');
  // A provider's own interstitial must never be treated as a result, even if it contains links.
  const isChallengeUrl = (raw) => {
    try {
      const u = new URL(raw);
      if (/(^|\\.)google\\./i.test(u.hostname) && /^\\/sorry(\\/|$)/.test(u.pathname)) return true;
      if (/(^|\\.)consent\\./i.test(u.hostname)) return true;
      if (/^\\/(captcha|challenge|verify)(\\/|$)/i.test(u.pathname)) return true;
      return false;
    } catch (e) { return false; }
  };
  const blocked = isChallengeUrl(location.href) || (!hasResults && /unusual traffic|captcha|are you a robot|verify you are human|automated queries|before you continue|aws waf|cloudflare|datadome|access denied/.test(bodyText));
  const containers = Array.from(document.querySelectorAll('.result, .b_algo, #search .g, .g, .snippet, .w-gl__result, article'));
  const pool = containers.length ? containers : Array.from(document.querySelectorAll('li, section, div'));
  const rows = [];
  const seen = new Set();
  for (const c of pool) {
    const a = c.querySelector('a[href]');
    if (!a) continue;
    let href = a.href || '';
    if (!/^https?:\\/\\//i.test(href)) continue;
    href = unwrap(href);
    if (isChallengeUrl(href)) continue;
    if (seen.has(href)) continue;
    const title = norm(a.innerText) || norm(a.getAttribute('aria-label') || '');
    if (title.length < 8) continue;
    seen.add(href);
    const sn = c.querySelector('.result__snippet, .b_caption p, [data-sncf], .snippet, p');
    rows.push({ title, url: href, snippet: norm(sn ? sn.innerText : '') });
    if (rows.length >= 30) break;
  }
  return { rows, blocked };
})()`;

const READY_SCRIPT = '!!document.querySelector(".result, .b_algo, #search a h3, .g, .snippet, .w-gl__result")';

const ENGINES: Record<string, EngineSpec> = {
  google: {
    id: 'google',
    label: 'Google (web-only udm=14)',
    build: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&udm=14&hl=en`,
  },
  duckduckgo: {
    id: 'duckduckgo',
    label: 'DuckDuckGo HTML',
    build: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  },
  bing: {
    id: 'bing',
    label: 'Bing',
    build: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}`,
  },
  brave: {
    id: 'brave',
    label: 'Brave Search',
    build: (q) => `https://search.brave.com/search?q=${encodeURIComponent(q)}`,
  },
  startpage: {
    id: 'startpage',
    label: 'Startpage',
    build: (q) => `https://www.startpage.com/sp/search?query=${encodeURIComponent(q)}`,
  },
};

export class SearchHub {
  /** Engines that recently returned a bot-check are tried last for a while. */
  private blockedUntil = new Map<string, number>();

  constructor(private deps: SearchHubDeps) {}

  public async search(
    query: string,
    opts: { engine?: string; engines?: string[]; urlTemplate?: string; max?: number } = {},
  ): Promise<SearchOutcome> {
    const q = (query || '').trim();
    if (!q) throw coded('BAD_REQUEST', 'search_web needs a non-empty query.');

    const max = Math.min(Math.max(1, opts.max ?? 8), 25);

    let ids: string[];
    if (Array.isArray(opts.engines) && opts.engines.length > 0) ids = opts.engines.map((s) => String(s).toLowerCase());
    else if (opts.engine) ids = [String(opts.engine).toLowerCase()];
    else ids = [...DEFAULT_ENGINE_CHAIN];

    // Stable reorder: an engine that recently challenged sinks to the back of the queue, so a
    // guaranteed 9-second interstitial is not paid on every run. An explicit single engine wins.
    if (!opts.engine) {
      const now = Date.now();
      const cooling = (id: string) => (this.blockedUntil.get(id) ?? 0) > now;
      ids = [...ids].sort((a, b) => Number(cooling(a)) - Number(cooling(b)));
    }

    const customTemplate = opts.urlTemplate || process.env.KUANG_SEARCH_URL || '';
    if (ids.includes('custom') && !customTemplate.includes('{query}')) {
      throw coded('BAD_REQUEST', 'engine "custom" needs a url_template containing {query} (e.g. "https://searx.local/search?q={query}").');
    }

    const attempts: SearchAttempt[] = [];

    for (const id of ids) {
      const spec: EngineSpec | undefined =
        id === 'custom'
          ? { id: 'custom', label: 'custom template', build: (qq: string) => customTemplate.replace('{query}', encodeURIComponent(qq)) }
          : ENGINES[id];

      if (!spec) {
        attempts.push({ engine: id, ok: false, count: 0, blocked: false, error: 'unknown engine' });
        continue;
      }

      try {
        const url = spec.build(q);
        const { result } = await this.deps.load(url, EXTRACT_SCRIPT, {
          timeoutMs: 15000,
          settleMs: 400,
          readyScript: READY_SCRIPT,
          readyMs: 4000,
        });
        const rows: any[] = Array.isArray(result?.rows) ? result.rows : [];
        const blocked = !!result?.blocked;
        if (blocked) this.blockedUntil.set(id, Date.now() + 10 * 60_000);
        attempts.push({ engine: id, ok: rows.length > 0 && !blocked, count: rows.length, blocked });

        // A challenge page can contain links; never return them, and always fall through to the
        // next engine rather than accepting a provider's interstitial as search results.
        if (rows.length > 0 && !blocked) {
          const results: SearchResult[] = rows.slice(0, max).map((r, i) => ({
            rank: i + 1,
            title: String(r.title || ''),
            url: String(r.url || ''),
            snippet: String(r.snippet || ''),
          }));
          this.deps.log?.('action', `search_web "${q}" → ${results.length} results via ${spec.label}`);
          return { query: q, engine: id, results, attempts, blocked: false, notes: `via ${spec.label}` };
        }

        this.deps.log?.(
          'warn',
          `search_web: engine "${id}" ${blocked ? 'returned a bot-check/consent page' : 'yielded no results'}; trying next.`,
        );
      } catch (err: any) {
        attempts.push({ engine: id, ok: false, count: 0, blocked: false, error: err?.message || String(err) });
      }
    }

    const anyBlocked = attempts.some((a) => a.blocked);
    return {
      query: q,
      engine: attempts.length ? attempts[attempts.length - 1].engine : null,
      results: [],
      attempts,
      blocked: anyBlocked,
      notes: anyBlocked
        ? 'A provider returned a bot-check/consent page — try another engine, or request_human_intervention.'
        : 'No results parsed from any engine.',
    };
  }
}
