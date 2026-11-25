/**
 * The site/page probe behind `llm_surface`.
 *
 * Why a module: discovering well-known files, reading the live page's declared
 * alternates, asking one negotiation HEAD and picking a recommendation is a
 * self-contained job. `LlmSurface` keeps the fetch/read contract and delegates
 * the discovery here, with the transport as an explicit dependency.
 *
 * Safety posture: only **well-known, spec-defined paths** at the origin
 * (`/llms.txt`, `/llms-full.txt`, `/sitemap.xml`) plus one `HEAD`; a per-page
 * alternate is read from the **live DOM** of the active page only. Results are
 * cached per origin/page so a probe never repeats a request within the TTL.
 */
import type { WebContents } from 'electron';
import type {
  LlmSurfaceEndpoint,
  LlmSurfaceKind,
  LlmSurfaceLink,
  LlmSurfaceReport,
  OriginProbe,
  PageProbe,
} from './surface-types.js';
import { MARKDOWN_LINK_RE, NEGOTIATE_ACCEPT, TEXT_ACCEPT } from './surface-types.js';
import type { ProbeTransport } from './probe-transport.js';
import { readAlternates } from './alternates.js';
import { isPageUrl, kindScope, normalizeUrl, resolveSurfaceUrl } from './surface-url.js';

/** When to use: constructing the probe — the transport and the active tab come from the chassis. */
export interface SurfaceProbeDeps {
  transport: ProbeTransport;
  getActiveWebContents?: () => WebContents | null;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
  ttlMs?: number;
}

/** When to use: `LlmSurface.probe` — what LLM-friendly surfaces a site/page offers. */
export class SurfaceProbe {
  private originCache = new Map<string, { at: number; data: OriginProbe }>();
  private pageCache = new Map<string, { at: number; data: PageProbe }>();
  private readonly ttlMs: number;

  constructor(private readonly deps: SurfaceProbeDeps) {
    this.ttlMs = deps.ttlMs ?? 10 * 60 * 1000;
  }

  /** Reports what LLM-friendly surfaces a site/page offers. */
  async probe(url?: string): Promise<LlmSurfaceReport> {
    const target = resolveSurfaceUrl(url, () => this.deps.getActiveWebContents?.()?.getURL?.() || '');
    const origin = new URL(target).origin;
    const isPage = isPageUrl(target);

    const originProbe = await this.probeOrigin(origin);
    const pageProbe = await this.probePage(target);
    const recommended = this.recommend(originProbe, pageProbe, isPage);
    const scope = recommended ? kindScope(recommended) : null;

    const notes = [...originProbe.notes];
    if (scope === 'origin' && isPage) {
      notes.push(
        `only an origin-level index is available for this page — ${origin} advertised no page-level representation`,
      );
    }
    const anchors = pageProbe.markdown_alternates.filter((a) => a.source === 'anchor').length;
    if (anchors > 0) notes.push(`discovered ${anchors} Markdown/Text alternate link(s) from page anchors`);

    this.deps.log?.('info', `llm_surface ${origin} → ${recommended ?? 'none (render)'}`);

    return {
      url: target,
      origin,
      llms_txt: originProbe.llms_txt,
      llms_full: originProbe.llms_full,
      sitemap: originProbe.sitemap,
      markdown_alternates: pageProbe.markdown_alternates,
      content_negotiation: pageProbe.content_negotiation,
      recommended,
      scope,
      next: recommended ? { tool: 'llm_fetch', as: recommended } : { tool: 'observe', as: 'markdown' },
      notes,
    };
  }

  clearCache(): void {
    this.originCache.clear();
    this.pageCache.clear();
  }

  private async probeOrigin(origin: string): Promise<OriginProbe> {
    const hit = this.originCache.get(origin);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.data;

    const notes: string[] = [];
    const probe = async (path: string, kind: 'text' | 'xml'): Promise<LlmSurfaceEndpoint> => {
      const url = origin + path;
      try {
        const r = await this.deps.transport.get(url, TEXT_ACCEPT, 'GET');
        const okStatus = r.status >= 200 && r.status < 400;
        const found =
          okStatus && this.deps.transport.isTextual(r.contentType) && !this.deps.transport.isHtml(r.contentType) && r.bytes > 0;
        const ep: LlmSurfaceEndpoint = { found, url, status: r.status, contentType: r.contentType, bytes: r.bytes };
        if (kind === 'xml' && found) ep.entries = (r.body.match(/<loc[ >]/gi) || []).length;
        if (!found && okStatus && this.deps.transport.isHtml(r.contentType)) {
          notes.push(`${path} served text/html (not an LLM surface)`);
        }
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

  private async probePage(url: string): Promise<PageProbe> {
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
          const r = await readAlternates(wc);
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
      const r = await this.deps.transport.get(url, NEGOTIATE_ACCEPT, 'HEAD');
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

  private recommend(origin: OriginProbe, page: PageProbe, isPage: boolean): LlmSurfaceKind | null {
    const pageMd = page.markdown_alternates.find(
      (a) => a.page_level && MARKDOWN_LINK_RE.test(a.type + ' ' + a.href),
    );
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
}
