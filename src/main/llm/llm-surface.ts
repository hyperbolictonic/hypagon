/**
 * LLM-Friendly Site Discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6).
 *
 * Many sites publish an LLM-friendly representation of their content: an
 * `/llms.txt` (or `/llms-full.txt`) index, a `/sitemap.xml`, a page-level
 * `<link rel="alternate" type="text/markdown">`, or content-negotiated
 * `text/markdown`. Reading those is ~5–10x cheaper than rendering the page and
 * running a Set-of-Marks harvest.
 *
 * Safety posture (the whole point of the design):
 *  - `probe()` only ever requests **well-known, spec-defined paths** at the origin
 *    (`/llms.txt`, `/llms-full.txt`, `/sitemap.xml`) plus one `HEAD` for content
 *    negotiation. A per-page alternate is read from the **live DOM** (the active
 *    page only). Results are cached per origin so we never repeat-hit.
 *  - A page-level Markdown/Text alternate is discovered two ways, both of which
 *    read what the page actually offers rather than guessing a path: a declared
 *    `<link rel="alternate">` and a **real `<a href="….md">` anchor** on the page.
 *  - `fetch()` is **gated**: it refuses with `NO_LLM_SURFACE` unless a probe
 *    confirmed an *advertised* surface. It never guesses paths and never fetches
 *    an arbitrary URL.
 *  - An advertised **per-page alternate** is loaded via a real document
 *    navigation (injected `navigateForText`), not a synthetic fetch.
 *  - A response that comes back `text/html` (or 4xx/5xx) is treated as "no
 *    surface" — never mislabelled as Markdown.
 *  - `readUrl()` is the composite: site-provided Markdown/Text when advertised,
 *    otherwise a **detached render** distilled to Markdown.
 *
 * Why this file is small: discovery lives in `surface-probe.ts` (with
 * `probe-transport.ts` and `alternates.ts`), the URL questions in
 * `surface-url.ts`, and the shapes in `surface-types.ts`. `LlmSurface` keeps the
 * fetch/read contract and the paging.
 */
import type {
  LlmFetchResult,
  LlmSurfaceDeps,
  LlmSurfaceKind,
  LlmSurfaceLink,
  LlmSurfaceReport,
  ReadUrlResult,
} from './surface-types.js';
import {
  coded,
  DEFAULT_READ_CHARS,
  MARKDOWN_LINK_RE,
  MAX_READ_CHARS,
  NEGOTIATE_ACCEPT,
  TEXT_ACCEPT,
  TEXT_LINK_RE,
} from './surface-types.js';
import { ProbeTransport } from './probe-transport.js';
import { SurfaceProbe } from './surface-probe.js';
import { isPageUrl, kindScope } from './surface-url.js';

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
} from './surface-types.js';

/** When to use: `llm_surface`/`llm_fetch` — probe well-known LLM representations and fetch the chosen one. */
export class LlmSurface {
  private readonly transport: ProbeTransport;
  private readonly probeSurface: SurfaceProbe;

  constructor(private deps: LlmSurfaceDeps) {
    this.transport = new ProbeTransport({ getSession: deps.getSession, userAgent: deps.userAgent });
    this.probeSurface = new SurfaceProbe({
      transport: this.transport,
      getActiveWebContents: deps.getActiveWebContents,
      log: deps.log,
      ttlMs: deps.ttlMs,
    });
  }

  /** Reports what LLM-friendly surfaces a site/page offers. */
  public async probe(url?: string): Promise<LlmSurfaceReport> {
    return await this.probeSurface.probe(url);
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

    const scope = kindScope(as);
    // The caller pointed at a page but the only representation is the site-wide index.
    const scope_mismatch = scope === 'origin' && isPageUrl(report.url);

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
    const r = await this.transport.get(target, as === 'markdown' ? NEGOTIATE_ACCEPT : TEXT_ACCEPT, 'GET');
    if (r.status >= 400) throw coded('FETCH_BLOCKED', `${target} returned HTTP ${r.status}.`);
    if (this.transport.isHtml(r.contentType)) throw coded('FETCH_BLOCKED', `${target} returned text/html, not Markdown/Text.`);
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
    if (wantKind && (opts.as || report.scope === 'page' || !isPageUrl(url))) {
      try {
        const r = await this.fetch({ url, as: wantKind });
        return this.page({
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
        return await this.renderFallback(url, `advertised ${wantKind} fetch failed: ${err?.message || err}`, opts);
      }
    }

    if (wantKind) {
      // Only an origin-level index exists for this page (e.g. a site-wide /llms.txt).
      return await this.renderFallback(url, `only the site-wide ${wantKind} index is available for this page`, opts);
    }

    return await this.renderFallback(url, 'no advertised LLM surface (recommended: null)', opts);
  }

  public clearCache(): void {
    this.probeSurface.clearCache();
  }

  // ---- internals ----------------------------------------------------------

  /** Renders `url` in the shared detached view and distils it to Markdown (composite fallback). */
  private async renderFallback(
    url: string,
    reason: string,
    opts: { maxChars?: number; cursor?: number | string },
  ): Promise<ReadUrlResult> {
    if (!this.deps.renderPage) {
      throw coded('NOT_SUPPORTED', `No render fallback is wired for read_url (cannot render ${url}).`);
    }
    const r = await this.deps.renderPage(url);
    if (!r.markdown) {
      throw coded('FETCH_BLOCKED', `Rendering ${url} produced no text (status ${r.status}).`);
    }
    return this.page({
      url,
      via: 'render',
      as: null,
      scope: 'page',
      scope_mismatch: false,
      contentType: r.contentType ?? 'text/markdown',
      title: r.title,
      full: r.markdown,
      opts,
      reason,
    });
  }

  /** Applies `max_chars`/`cursor` paging to a full document and shapes the result. */
  private page(input: {
    url: string;
    via: 'llm_fetch' | 'render';
    as: LlmSurfaceKind | null;
    scope: 'origin' | 'page';
    scope_mismatch: boolean;
    contentType: string | null;
    title?: string;
    full: string;
    opts: { maxChars?: number; cursor?: number | string };
    reason?: string;
  }): ReadUrlResult {
    const full = input.full || '';
    const max = Math.min(Math.max(Number(input.opts.maxChars) || DEFAULT_READ_CHARS, 500), MAX_READ_CHARS);
    const offset = Math.max(Math.floor(Number(input.opts.cursor)) || 0, 0);
    const content = full.slice(offset, offset + max);
    const end = offset + content.length;
    const truncated = end < full.length;
    return {
      url: input.url,
      via: input.via,
      as: input.as,
      scope: input.scope,
      scope_mismatch: input.scope_mismatch,
      contentType: input.contentType,
      title: input.title,
      total: full.length,
      offset,
      next_cursor: truncated ? end : null,
      truncated,
      content,
      reason: input.reason,
    };
  }
}
