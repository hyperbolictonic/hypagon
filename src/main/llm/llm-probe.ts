/**
 * Probing what a site or page advertises.
 *
 * Origin probes only ever request the spec-defined well-known paths. Page probes read the live
 * DOM (active page only) for declared alternates and real `.md`/`.txt` anchors, then send one
 * HEAD to ask whether the server negotiates Markdown. Results are cached per origin/page so a
 * crawl never repeat-hits.
 *
 * When to use: `LlmSurface.probe` — this owns discovery and ranking; the surface owns the
 * published report and the gated fetch.
 */
import type { WebContents } from 'electron';
import {
  MARKDOWN_LINK_RE,
  NEGOTIATE_ACCEPT,
  TEXT_ACCEPT,
  TEXT_LINK_RE,
  isHtml,
  isTextual,
  netGet,
  normalizeUrl,
} from './llm-net.js';
import type {
  LlmSurfaceDeps,
  LlmSurfaceEndpoint,
  LlmSurfaceKind,
  LlmSurfaceLink,
  OriginProbe,
  PageProbe,
} from './llm-types.js';

/** When to use: `LlmSurface` — one probe per surface, holding the origin/page caches. */
export class LlmProbe {
  private originCache = new Map<string, { at: number; data: OriginProbe }>();
  private pageCache = new Map<string, { at: number; data: PageProbe }>();
  private readonly ttlMs: number;
  private readonly deps: LlmSurfaceDeps;

  constructor(deps: LlmSurfaceDeps) {
    this.deps = deps;
    this.ttlMs = deps.ttlMs ?? 10 * 60 * 1000;
  }

  /** When to use: clearing both caches (a settings change or an explicit refresh). */
  clear(): void {
    this.originCache.clear();
    this.pageCache.clear();
  }

  /** When to use: `probe` — the three well-known paths, cached per origin. */
  async probeOrigin(origin: string): Promise<OriginProbe> {
    const hit = this.originCache.get(origin);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.data;

    const notes: string[] = [];
    const probe = async (path: string, kind: 'text' | 'xml'): Promise<LlmSurfaceEndpoint> => {
      const url = origin + path;
      try {
        const r = await netGet(this.deps, url, TEXT_ACCEPT, 'GET');
        const okStatus = r.status >= 200 && r.status < 400;
        const found = okStatus && isTextual(r.contentType) && !isHtml(r.contentType) && r.bytes > 0;
        const ep: LlmSurfaceEndpoint = { found, url, status: r.status, contentType: r.contentType, bytes: r.bytes };
        if (kind === 'xml' && found) ep.entries = (r.body.match(/<loc[ >]/gi) || []).length;
        if (!found && okStatus && isHtml(r.contentType)) notes.push(`${path} served text/html (not an LLM surface)`);
        return ep;
      } catch (err: any) {
        notes.push(`${path}: ${err?.message || 'request failed'}`);
        return { found: false, url, status: 0, contentType: null, bytes: 0 };
      }
    };

    const llms_txt = await probe('/llms.txt', 'text');
    const llms_full = llms_txt.found
      ? await probe('/llms-full.txt', 'text')
      : ({ found: false, url: origin + '/llms-full.txt' } as LlmSurfaceEndpoint);
    const sitemap = await probe('/sitemap.xml', 'xml');

    const data: OriginProbe = { llms_txt, llms_full, sitemap, notes };
    this.originCache.set(origin, { at: Date.now(), data });
    return data;
  }

  /** When to use: `probe` — page-level alternates plus one negotiation HEAD. */
  async probePage(url: string): Promise<PageProbe> {
    const key = normalizeUrl(url);
    const hit = this.pageCache.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.data;

    // 1. Per-page alternates — read from the live DOM, and only when this IS the
    //    active page (zero extra requests; never a speculative fetch of a URL).
    //    A page that is still parsing (or a tab still committing its navigation, which
    //    may not report the target URL yet) yields an *inconclusive* read: it is
    //    returned but NOT cached, so a half-loaded page cannot poison the probe for
    //    the whole TTL.
    let markdown_alternates: LlmSurfaceLink[] = [];
    let domConclusive = true;
    try {
      const wc = this.deps.getActiveWebContents?.();
      if (wc) {
        const wcUrl = wc.getURL?.() || '';
        if (normalizeUrl(wcUrl) === key) {
          const r = await this.readAlternates(wc);
          markdown_alternates = r.links;
          domConclusive = r.ready;
        } else if (!wcUrl || wcUrl === 'about:blank' || wc.isLoading?.()) {
          // The active tab is mid-navigation and may commit to `key` a moment from now.
          domConclusive = false;
        }
      }
    } catch {
      /* DOM probe is best-effort */
    }

    // 2. Content negotiation — a single HEAD. A Markdown-aware server answers text/markdown.
    let content_negotiation: PageProbe['content_negotiation'] = { accepts_markdown: false, content_type: null };
    try {
      const r = await netGet(this.deps, url, NEGOTIATE_ACCEPT, 'HEAD');
      const ct = (r.contentType || '').split(';')[0].trim().toLowerCase();
      content_negotiation = {
        accepts_markdown: r.status < 400 && (ct === 'text/markdown' || ct === 'text/plain'),
        content_type: r.contentType || null,
      };
    } catch (err: any) {
      this.deps.log?.('info', `llm_surface negotiation HEAD failed for ${url}: ${err?.message || err}`);
    }

    const data: PageProbe = { markdown_alternates, content_negotiation };
    if (domConclusive) this.pageCache.set(key, { at: Date.now(), data });
    return data;
  }

  /** When to use: `probe` — ranking a page-level alternate above a site-wide index. */
  recommend(origin: OriginProbe, page: PageProbe, isPage: boolean): LlmSurfaceKind | null {
    const pageMd = page.markdown_alternates.find((a) => a.page_level && MARKDOWN_LINK_RE.test(a.type + ' ' + a.href));
    const pageAny = page.markdown_alternates.find((a) => a.page_level);

    // For a specific page, a page-level representation beats a site-wide index — the
    // caller asked for THIS page. An origin index is still offered when it is the only
    // option; `probe()` then flags the scope mismatch in `notes`/`scope_mismatch`.
    if (isPage) {
      if (pageMd) return 'markdown';
      if (page.content_negotiation.accepts_markdown) return 'markdown';
      if (pageAny) return 'text';
    }
    if (origin.llms_txt.found) return 'llms_txt';
    if (origin.llms_full.found) return 'llms_full';
    if (pageMd) return 'markdown';
    if (pageAny) return 'text';
    if (page.content_negotiation.accepts_markdown) return 'markdown';
    return null;
  }

  private async readAlternates(wc: WebContents): Promise<{ links: LlmSurfaceLink[]; ready: boolean }> {
    // Read what the live page *actually offers*: a declared <link rel="alternate">, and
    // real <a href="….md|.txt"> anchors (a self-link to the Markdown sibling, or a
    // "View as Markdown" link). We never construct or guess a path.
    // `ready` is false while the document is still parsing, so the caller can avoid
    // caching an empty result read from a half-loaded page.
    const script = `(() => {
      const out = [];
      const push = (href, type, rel, source) => { if (href) out.push({ href, type: (type || '').toLowerCase(), rel: (rel || '').toLowerCase(), source }); };
      for (const l of document.querySelectorAll('link[rel~="alternate"]')) {
        push(l.href, l.getAttribute('type'), l.getAttribute('rel'), 'link');
      }
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.href || '';
        if (!/^https?:/i.test(href)) continue;
        if (!/\\.md($|[?#])/i.test(href) && !/\\.txt($|[?#])/i.test(href)) continue;
        push(href, '', a.getAttribute('rel'), 'anchor');
      }
      return { ready: document.readyState !== 'loading', links: out };
    })()`;
    const raw = await wc.executeJavaScript(script).catch(() => null);
    const rawLinks: any[] = Array.isArray((raw as any)?.links) ? (raw as any).links : [];
    const ready = (raw as any)?.ready !== false;

    let page: URL | null = null;
    try {
      page = new URL(wc.getURL?.() || '');
    } catch {
      page = null;
    }

    const isMd = (l: { type: string; href: string }) => MARKDOWN_LINK_RE.test(l.type + ' ' + l.href);
    const isTxt = (l: { type: string; href: string }) => l.type === 'text/plain' || TEXT_LINK_RE.test(l.href);

    interface Candidate {
      link: LlmSurfaceLink;
      rank: number;
    }
    const seen = new Set<string>();
    const candidates: Candidate[] = [];

    for (const l of rawLinks) {
      const href = String(l?.href || '');
      if (!href || seen.has(href)) continue;
      const source: 'link' | 'anchor' = l?.source === 'link' ? 'link' : 'anchor';
      const link: LlmSurfaceLink = {
        href,
        type: String(l?.type || ''),
        rel: String(l?.rel || 'alternate'),
        source,
        page_level: source === 'link',
      };
      if (!isMd(link) && !isTxt(link)) continue;

      // Rank so the most trustworthy candidate wins: a declared <link> first, then this
      // page's own ".md/.txt" sibling, then other same-origin anchors, then cross-origin.
      let rank = source === 'link' ? 0 : 100;
      if (source === 'anchor') {
        try {
          const h = new URL(href);
          if (!page || h.origin !== page.origin) {
            rank += 60;
          } else {
            const sibling = page.pathname.replace(/\/$/, '') + (isMd(link) ? '.md' : '.txt');
            if (h.pathname === sibling) {
              rank -= 50;
              link.page_level = true;
            } else {
              rank += 10;
            }
          }
        } catch {
          rank += 80;
        }
      }

      seen.add(href);
      candidates.push({ link, rank });
    }

    candidates.sort((a, b) => a.rank - b.rank);
    return { links: candidates.slice(0, 10).map((c) => c.link), ready };
  }
}
