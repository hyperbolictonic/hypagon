/**
 * `deep_crawl` — BFS crawl from a seed URL (TODO_RESEARCH_CRAWL.md §5, Feature 1).
 *
 * Depth- and page-budgeted breadth-first crawl. Each page takes the **cheap path first**: if the
 * site advertises a Markdown/Text representation (content negotiation — see `llm-surface.ts`), the
 * page is read as text instead of rendered; otherwise it is rendered in a detached view. Every
 * page is distilled to Markdown and (optionally) indexed into LanceDB Cortex.
 *
 * Politeness: same-origin by default, a per-page delay, a hard page budget, and `match_patterns`
 * for scoping. URLs are de-duplicated (fragments stripped).
 *
 * The shapes live in `crawl/types.ts` and the URL/link rules in `crawl/urls.ts`; this module is
 * only the breadth-first walk and its fetch tiers.
 */
import type { CitationAnchor } from '../research/anchors.js';
import { linksFromMarkdown, matchesAnyPattern, normalizeUrl } from './urls.js';
import type { CrawlOptions, CrawlOutcome, CrawlPage, CrawlerDeps } from './types.js';

export { linksFromMarkdown, matchesAnyPattern, normalizeUrl } from './urls.js';
export type { CrawlOptions, CrawlOutcome, CrawlPage, CrawlerDeps, HumanAssistInfo } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** When to use: running `deep_crawl` or a focused page crawl from the research surface. */
export class Crawler {
  private deps: CrawlerDeps;

  constructor(deps: CrawlerDeps) {
    this.deps = deps;
  }

  public async crawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const start = normalizeUrl(opts.startUrl || '');
    if (!/^https?:\/\//i.test(start)) {
      const e = new Error('deep_crawl needs an http(s) start URL.') as Error & { code: string };
      e.code = 'BAD_REQUEST';
      throw e;
    }

    const maxDepth = clamp(opts.maxDepth ?? 2, 0, 5);
    const maxPages = clamp(opts.maxPages ?? 5, 1, 25);
    const sameOrigin = opts.sameOrigin !== false;
    const delayMs = clamp(opts.delayMs ?? 300, 0, 5000);
    const concurrency = clamp(opts.concurrency ?? 1, 1, 4);
    const startOrigin = new URL(start).origin;

    const visited = new Set<string>([start]);
    const queue: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];
    const pages: CrawlPage[] = [];
    const notes: string[] = [];
    let cortexIndexed = 0;
    let depthReached = 0;
    let truncated = false;

    while (queue.length > 0 && pages.length < maxPages) {
      const batch: Array<{ url: string; depth: number }> = [];
      while (batch.length < concurrency && queue.length > 0 && pages.length + batch.length < maxPages) {
        batch.push(queue.shift()!);
      }
      if (batch.length === 0) break;

      const results = await Promise.all(
        batch.map(({ url, depth }) => this.processPage(url, depth, opts)),
      );

      for (const result of results) {
        pages.push(result.page);
        depthReached = Math.max(depthReached, result.page.depth);
        if (result.indexed) cortexIndexed++;
        notes.push(...result.notes);
        try {
          opts.onPage?.(result.page);
        } catch {
          // UI progress must never fail the crawl.
        }

        if (result.page.depth >= maxDepth) continue;
        for (const link of result.links) {
          const norm = normalizeUrl(link);
          if (visited.has(norm)) continue;
          let origin = '';
          try {
            origin = new URL(norm).origin;
          } catch {
            continue;
          }
          if (sameOrigin && origin !== startOrigin) continue;
          if (!matchesAnyPattern(norm, opts.matchPatterns)) continue;
          visited.add(norm);
          queue.push({ url: norm, depth: result.page.depth + 1 });
        }
      }

      if (delayMs > 0 && queue.length > 0 && pages.length < maxPages) {
        await sleep(delayMs);
      }
    }

    if (queue.length > 0 && pages.length >= maxPages) truncated = true;
    if (truncated) notes.push(`Stopped at the ${maxPages}-page budget (${queue.length} URL(s) still queued).`);

    const outcome: CrawlOutcome = {
      startUrl: start,
      pages,
      pageCount: pages.length,
      depthReached,
      cortexIndexed,
      sameOrigin,
      truncated,
      notes,
    };
    this.deps.log?.('action', `deep_crawl ${start} → ${pages.length} page(s), depth ${depthReached}, ${cortexIndexed} indexed`);
    return outcome;
  }

  private async processPage(
    url: string,
    depth: number,
    opts: CrawlOptions,
  ): Promise<{ page: CrawlPage; links: string[]; indexed: boolean; notes: string[] }> {
    const notes: string[] = [];
    const pageStarted = Date.now();
    let title = '';
    let content = '';
    let via: 'llm' | 'static' | 'render' = 'render';
    let links: string[] = [];
    let error: string | undefined;
    let humanAssisted = false;
    let humanMs = 0;
    let anchors: CitationAnchor[] | undefined;

    try {
      await this.deps.beforePage?.(url);
    } catch (err: any) {
      error = err?.message || String(err);
      notes.push(`skipped ${url}: ${error}`);
      return {
        page: { url, title: url, depth, via: 'render', bytes: 0, links: 0, indexed: false, error, ms: Date.now() - pageStarted },
        links: [],
        indexed: false,
        notes,
      };
    }

    let usedCheap = false;
    let staticFailure: string | null = null;
    let escalation: CrawlPage['escalation'] | undefined;
    if (opts.preferLlm !== false && this.deps.tryLlm) {
      try {
        const r = await this.deps.tryLlm(url);
        if (r && r.content && r.content.trim().length > 0) {
          content = r.content;
          via = 'llm';
          usedCheap = true;
        }
      } catch (err: any) {
        notes.push(`llm path failed for ${url}: ${err?.message || err}`);
      }
    }

    // Static impersonating fetch: Chrome-identical at the network layer, no browser.
    if (!usedCheap && opts.preferStatic !== false && this.deps.fetchStatic) {
      try {
        const r = await this.deps.fetchStatic(url, { anchorsFor: opts.anchorsFor });
        if (r.ok && r.markdown && r.markdown.trim().length > 0) {
          content = r.markdown;
          title = r.title;
          via = 'static';
          anchors = r.anchors;
          usedCheap = true;
        } else if (!r.ok) {
          if (r.disabled) {
            // Not a failure: the tier is simply unavailable (e.g. no vendored binary). Reporting
            // this as an escalation would tell the agent every page changed tier.
            notes.push(`static tier unavailable for ${url}: ${r.reason}`);
          } else {
            staticFailure = r.reason;
            notes.push(`static tier skipped for ${url}: ${r.reason}`);
          }
        } else {
          staticFailure = 'static fetch produced no content';
        }
      } catch (err: any) {
        staticFailure = err?.message || String(err);
        notes.push(`static path failed for ${url}: ${staticFailure}`);
      }
    }

    if (!usedCheap) {
      try {
        const r = await this.deps.renderPage(url, {
          selector: opts.selector,
          onHuman: opts.onHuman,
          anchorsFor: opts.anchorsFor,
        });
        title = r.title;
        content = r.markdown;
        links = r.links || [];
        humanAssisted = !!r.humanAssisted;
        humanMs = r.humanMs ?? 0;
        anchors = r.anchors;
      } catch (err: any) {
        error = err?.message || String(err);
        notes.push(`render failed for ${url}: ${error}`);
      }

      // Only claim an escalation when the render actually produced the page.
      if (!error && staticFailure) {
        escalation = { from: 'static', to: 'render', reason: staticFailure };
        notes.push(`escalated ${url} to render: ${staticFailure}`);
      }
    } else {
      links = linksFromMarkdown(content, url);
    }

    let indexed = false;
    if (!error && content && content.trim().length > 50 && this.deps.indexPage) {
      try {
        await this.deps.indexPage(url, title || url, content);
        indexed = true;
      } catch (err: any) {
        notes.push(`cortex index failed for ${url}: ${err?.message || err}`);
      }
    }

    return {
      page: {
        url,
        title: title || url,
        depth,
        via,
        bytes: Buffer.byteLength(content, 'utf8'),
        links: links.length,
        indexed,
        error,
        escalation,
        humanAssisted,
        humanMs,
        anchors,
        ms: Date.now() - pageStarted,
        excerpt: opts.includeContent ? content.slice(0, opts.includeContent) : undefined,
      },
      links,
      indexed,
      notes,
    };
  }
}
