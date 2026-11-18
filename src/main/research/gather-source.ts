/**
 * One research source: fetch it through the crawl pipeline, map the result, emit the
 * per-source timeline events.
 *
 * Kept out of the Researcher class so the run loop reads as orchestration. Every
 * failure becomes a source with an `error` — a research run never aborts because one
 * URL was slow or hostile.
 *
 * When to use: gathering or mapping a single source inside `research_topic`.
 */

import type { HumanAssistInfo } from '../crawl/crawler.js';
import type { ResearchEvent } from '../../shared/research-events.js';
import type { ResearchOptions, ResearchSource } from './types.js';

/** When to use: the search hit being gathered (rank/url/title/snippet). */
export interface SourceCandidate {
  rank: number;
  url: string;
  title: string;
  snippet: string;
}

/** When to use: the run context a source is gathered under (ids, budget, emit, crawl). */
export interface GatherSourceContext {
  runId: string;
  query: string;
  excerptChars: number;
  opts: ResearchOptions;
  crawl: (opts: import('../crawl/crawler.js').CrawlOptions) => Promise<import('../crawl/crawler.js').CrawlOutcome>;
  emit: (event: ResearchEvent) => void;
}

/** When to use: the gathered source plus the totals its crawl contributed. */
export interface GatheredSource {
  source: ResearchSource;
  cortexIndexed: number;
  anchorCount: number;
}

/**
 * Extractive highlights: paragraphs of the source that mention the most query terms, best first.
 * (Not a summary — it is a citation aid so the caller can quote real evidence.)
 */
export function extractHighlights(markdown: string, query: string, max = 3): string[] {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  const paragraphs = (markdown || '')
    .split(/\n{2,}/)
    .map((p) => p.replace(/[#*>`_\-[\]()]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 60);
  if (!paragraphs.length) return [];

  const scored = paragraphs.map((p) => {
    const low = p.toLowerCase();
    let score = 0;
    for (const t of terms) if (low.includes(t)) score += 1;
    return { p, score };
  });

  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const pool = hits.length ? hits : scored;
  return pool.slice(0, max).map((s) => s.p.slice(0, 320));
}

/** When to use: gathering one search hit into a typed source, emitting its done event. */
export async function gatherSource(candidate: SourceCandidate, ctx: GatherSourceContext): Promise<GatheredSource> {
  const { runId, query, excerptChars, opts, crawl, emit } = ctx;
  try {
    const crawled = await crawl({
      startUrl: candidate.url,
      maxDepth: 0,
      maxPages: 1,
      delayMs: opts.delayMs ?? 0,
      preferLlm: opts.preferLlm !== false,
      preferStatic: opts.preferStatic !== false,
      anchorsFor: opts.anchors !== false ? query : undefined,
      harvestToCortex: opts.harvestToCortex !== false,
      includeContent: excerptChars,
      onHuman: (info: HumanAssistInfo) => {
        if (info.phase === 'needed') {
          emit({ type: 'human-needed', runId, url: info.url, reason: 'challenge', at: Date.now() });
        } else {
          emit({ type: 'human-done', runId, url: info.url, via: 'human', at: Date.now() });
        }
      },
    });
    const page = crawled.pages[0];
    const excerpt = page?.excerpt || '';
    const via = page?.via || 'render';
    const bytes = page?.bytes || 0;
    const indexed = !!page?.indexed;
    const escalation = page?.escalation;
    const highlights = extractHighlights(excerpt, query, 3);
    const ms = page?.ms ?? 0;
    const title = page?.title || candidate.title;
    const humanAssisted = !!page?.humanAssisted;
    const humanMs = page?.humanMs ?? 0;
    const anchors = page?.anchors;
    const anchorDetails = (anchors ?? []).map((anchor) => ({
      text: anchor.text,
      path: anchor.path,
      fingerprint: anchor.fingerprint as unknown as Record<string, unknown>,
    }));

    const source: ResearchSource = {
      rank: candidate.rank,
      title,
      url: candidate.url,
      snippet: candidate.snippet,
      via,
      bytes,
      ms,
      indexed,
      humanAssisted,
      humanMs,
      anchors,
      highlights,
      error: page?.error,
      escalation,
    };

    emit({
      type: 'source-done',
      runId,
      rank: candidate.rank,
      url: candidate.url,
      title,
      via,
      bytes,
      ms,
      humanAssisted,
      humanMs,
      anchors: anchors?.length ?? 0,
      anchorDetails,
      highlights: highlights.length,
      indexed,
      escalation,
      error: page?.error,
      at: Date.now(),
    });

    return { source, cortexIndexed: crawled.cortexIndexed, anchorCount: anchors?.length ?? 0 };
  } catch (err: any) {
    const message = err?.message || String(err);
    const source: ResearchSource = {
      rank: candidate.rank,
      title: candidate.title,
      url: candidate.url,
      snippet: candidate.snippet,
      via: 'render',
      bytes: 0,
      indexed: false,
      highlights: [],
      error: message,
    };
    emit({
      type: 'source-done',
      runId,
      rank: candidate.rank,
      url: candidate.url,
      title: candidate.title,
      via: 'render',
      bytes: 0,
      ms: 0,
      highlights: 0,
      anchors: 0,
      indexed: false,
      error: message,
      at: Date.now(),
    });
    return { source, cortexIndexed: 0, anchorCount: 0 };
  }
}
