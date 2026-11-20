/**
 * LLM-Friendly Site Discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6).
 *
 * Many sites publish an LLM-friendly representation of their content: an `/llms.txt` (or
 * `/llms-full.txt`) index, a `/sitemap.xml`, a page-level `<link rel="alternate"
 * type="text/markdown">`, or content-negotiated `text/markdown`. Reading those is ~5–10x
 * cheaper than rendering the page and running a Set-of-Marks harvest.
 *
 * Safety posture (the whole point of the design):
 *  - `probe()` only ever requests **well-known, spec-defined paths** at the origin plus one
 *    `HEAD` for content negotiation. A per-page alternate is read from the **live DOM** (the
 *    active page only). Results are cached per origin so we never repeat-hit.
 *  - `fetch()` is **gated**: it refuses with `NO_LLM_SURFACE` unless a probe confirmed an
 *    *advertised* surface. It never guesses paths and never fetches an arbitrary URL.
 *  - An advertised per-page alternate is loaded via a real document navigation, so the request
 *    carries Chromium's full header + renderer fingerprint.
 *  - A response that comes back `text/html` (or 4xx/5xx) is treated as "no surface".
 *  - `readUrl()` is the composite: site-provided Markdown/Text when advertised, otherwise a
 *    detached render distilled to Markdown, so a caller never has to branch.
 *
 * Discovery lives in `llm-probe.ts`, the shared HTTP/text rules in `llm-net.ts`, and paging
 * plus the render fallback in `llm-read.ts`.
 */
import { MARKDOWN_LINK_RE, NEGOTIATE_ACCEPT, TEXT_ACCEPT, TEXT_LINK_RE, coded, isHtml, netGet } from './llm-net.js';
import { LlmProbe } from './llm-probe.js';
import { pageResult, renderFallback } from './llm-read.js';
import type {
  LlmFetchResult,
  LlmSurfaceDeps,
  LlmSurfaceKind,
  LlmSurfaceLink,
  LlmSurfaceReport,
  LlmSurfaceScope,
  ReadUrlResult,
} from './llm-types.js';

export type {
  LlmFetchResult,
  LlmSurfaceDeps,
  LlmSurfaceEndpoint,
  LlmSurfaceKind,
  LlmSurfaceLink,
  LlmSurfaceNext,
  LlmSurfaceReport,
  LlmSurfaceScope,
  ReadUrlResult,
} from './llm-types.js';

/** When to use: probing for llms.txt/llms-full/markdown surfaces before rendering a page. */
export class LlmSurface {
  private readonly deps: LlmSurfaceDeps;
  private readonly probeCache: LlmProbe;

  constructor(deps: LlmSurfaceDeps) {
    this.deps = deps;
    this.probeCache = new LlmProbe(deps);
  }

  /** Reports what LLM-friendly surfaces a site/page offers. */
  public async probe(url?: string): Promise<LlmSurfaceReport> {
    const target = this.resolveUrl(url);
    const origin = new URL(target).origin;
    const isPage = this.isPageUrl(target);

    const originProbe = await this.probeCache.probeOrigin(origin);
    const pageProbe = await this.probeCache.probePage(target);
    const recommended = this.probeCache.recommend(originProbe, pageProbe, isPage);
    const scope = recommended ? this.kindScope(recommended) : null;

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

  /** Fetches an advertised LLM-friendly representation. Gated on a confirmed surface. */
  public async fetch(opts: { url?: string; as?: LlmSurfaceKind } = {}): Promise<LlmFetchResult> {
    const report = await this.probe(opts.url);
    const as = opts.as || report.recommended;

    if (!as) {
      throw coded(
        'NO_LLM_SURFACE',
        `${report.origin} advertises no LLM-friendly surface — read ${report.url} with observe(as:"markdown") or read_url.`,
      );
    }

    let target: string | undefined;
    let viaAlternate = false;

    if (as === 'llms_txt') {
      target = report.llms_txt.found ? report.llms_txt.url : undefined;
    } else if (as === 'llms_full') {
      target = report.llms_full.found ? report.llms_full.url : undefined;
    } else if (as === 'markdown' || as === 'text') {
      const wantMd = as === 'markdown';
      const matches = (a: LlmSurfaceLink) =>
        wantMd ? MARKDOWN_LINK_RE.test(a.type + ' ' + a.href) : a.type === 'text/plain' || TEXT_LINK_RE.test(a.href);
      // Prefer a page-level alternate (declared <link>, or this page's own ".md" sibling);
      // fall back to any advertised match so an explicit request still resolves.
      const alt = report.markdown_alternates.find((a) => a.page_level && matches(a)) || report.markdown_alternates.find(matches);
      if (alt) {
        target = alt.href;
        viaAlternate = true;
      } else if (report.content_negotiation.accepts_markdown) {
        target = report.url;
      }
    } else {
      throw coded('BAD_REQUEST', `Unknown "as" value "${as}" — expected llms_txt | llms_full | markdown | text.`);
    }

    if (!target) {
      throw coded('NO_LLM_SURFACE', `${report.url} has no advertised "${as}" representation.`);
    }

    const scope = this.kindScope(as);
    // The caller pointed at a page but the only representation is the site-wide index.
    const scope_mismatch = scope === 'origin' && this.isPageUrl(report.url);

    // Tier B — an advertised per-page alternate: real document navigation.
    if (viaAlternate && this.deps.navigateForText) {
      const r = await this.deps.navigateForText(target);
      const ct = (r.contentType || '').toLowerCase();
      if (r.status >= 400 || ct.includes('text/html') || !r.body) {
        throw coded('FETCH_BLOCKED', `Advertised alternate ${target} did not return Markdown/Text (status ${r.status}, type ${ct || 'unknown'}).`);
      }
      return { as, url: target, scope, scope_mismatch, contentType: ct || null, bytes: r.body.length, content: r.body, via: 'navigation' };
    }

    // Tier A — header-driven resource fetch (static well-known files, or a negotiated page).
    const r = await netGet(this.deps, target, as === 'markdown' ? NEGOTIATE_ACCEPT : TEXT_ACCEPT, 'GET');
    if (r.status >= 400) throw coded('FETCH_BLOCKED', `${target} returned HTTP ${r.status}.`);
    if (isHtml(r.contentType)) throw coded('FETCH_BLOCKED', `${target} returned text/html, not Markdown/Text.`);
    return { as, url: target, scope, scope_mismatch, contentType: r.contentType, bytes: r.bytes, content: r.body, via: 'net.fetch' };
  }

  /**
   * The composite read (issue #1): probe → the site's own Markdown/Text when it
   * advertises one → otherwise a *detached* render distilled to Markdown. Always
   * returns text, so a caller never branches on `recommended`, and paged so a long
   * document is never silently truncated.
   */
  public async readUrl(
    opts: { url?: string; maxChars?: number; cursor?: number | string; as?: LlmSurfaceKind } = {},
  ): Promise<ReadUrlResult> {
    const report = await this.probe(opts.url);
    const url = report.url;
    const wantKind = opts.as || report.recommended;

    // An explicit `as` always wins. Otherwise, only take a *fetchable* representation when it
    // actually covers the thing the caller asked for: a page wants a `page`-scoped surface. If
    // the only thing on offer is a site-wide index (`origin`) for a page URL, render the page
    // instead — returning the site index would answer a different question.
    if (wantKind && (opts.as || report.scope === 'page' || !this.isPageUrl(url))) {
      try {
        const r = await this.fetch({ url, as: wantKind });
        return pageResult({
          url: r.url,
          via: 'llm_fetch',
          as: r.as,
          scope: r.scope,
          scope_mismatch: r.scope_mismatch,
          contentType: r.contentType,
          full: r.content,
          opts,
        });
      } catch (err: any) {
        // Advertised but unfetchable → fall through to a render, reporting why.
        return await renderFallback(this.deps, url, `advertised ${wantKind} fetch failed: ${err?.message || err}`, opts);
      }
    }

    if (wantKind) {
      // Only an origin-level index exists for this page (e.g. a site-wide /llms.txt).
      return await renderFallback(this.deps, url, `only the site-wide ${wantKind} index is available for this page`, opts);
    }

    return await renderFallback(this.deps, url, 'no advertised LLM surface (recommended: null)', opts);
  }

  public clearCache(): void {
    this.probeCache.clear();
  }

  // ---- internals ----------------------------------------------------------

  /** A URL with a non-root path is "a page", which should prefer a page-level representation. */
  private isPageUrl(u: string): boolean {
    try {
      return new URL(u).pathname.replace(/\/+$/, '').length > 0;
    } catch {
      return false;
    }
  }

  private kindScope(kind: LlmSurfaceKind): LlmSurfaceScope {
    return kind === 'llms_txt' || kind === 'llms_full' ? 'origin' : 'page';
  }

  private resolveUrl(url?: string): string {
    const candidate = (url || '').trim();
    if (candidate) {
      if (!/^https?:\/\//i.test(candidate)) throw coded('BAD_REQUEST', `llm_surface needs an http(s) URL (got "${candidate}").`);
      return candidate;
    }
    const wc = this.deps.getActiveWebContents?.();
    const current = wc?.getURL?.() || '';
    if (!/^https?:\/\//i.test(current)) throw coded('BAD_REQUEST', 'No URL given and the active tab is not on an http(s) page.');
    return current;
  }
}
