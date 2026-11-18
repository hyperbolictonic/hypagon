/**
 * `research_topic` — autonomous research mode (TODO_RESEARCH_CRAWL.md §5, Feature 3).
 *
 * search → fetch the top sources (cheap `llm` path first) → distill to Markdown → index into
 * LanceDB Cortex → return **extractive**, cited evidence.
 *
 * It is deliberately **not** a summarizer: the app has no LLM, so the tool gathers and ranks cited
 * evidence (per-source highlights are paragraphs from the sources that mention the query terms)
 * and leaves the prose synthesis to the calling agent. Sources are indexed into Cortex so the
 * agent can follow up with `recall_memory`.
 *
 * Per-source fetching and the public types live beside this module: gather-source.ts and
 * types.ts.
 */
import { randomUUID } from 'node:crypto';

import type { ResearchEvent, ResearchTier } from '../../shared/research-events.js';
import { gatherSource } from './gather-source.js';
import { summarizeRun } from './summary.js';
import type { ResearchOptions, ResearchOutcome, ResearchSource, ResearcherDeps } from './types.js';

export type { ResearchOptions, ResearchOutcome, ResearchSource, ResearcherDeps } from './types.js';
export { extractHighlights } from './gather-source.js';

function coded(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

/** Provider interstitials that must never become research sources. */
function isChallengeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (/(^|\.)google\./i.test(url.hostname) && /^\/sorry(\/|$)/.test(url.pathname)) return true;
    if (/(^|\.)consent\./i.test(url.hostname)) return true;
    if (/^\/(captcha|challenge|verify)(\/|$)/i.test(url.pathname)) return true;
  } catch {
    return true;
  }
  return false;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/** When to use: running the multi-source research pipeline behind `research_topic`. */
export class Researcher {
  private deps: ResearcherDeps;

  constructor(deps: ResearcherDeps) {
    this.deps = deps;
  }

  public async research(opts: ResearchOptions): Promise<ResearchOutcome> {
    const query = (opts.query || '').trim();
    if (!query) throw coded('BAD_REQUEST', 'research_topic needs a non-empty query.');

    const maxSources = clamp(opts.maxSources ?? 5, 1, 8);
    const excerptChars = clamp(opts.excerptChars ?? 1200, 200, 4000);
    const notes: string[] = [];
    const runId = randomUUID();
    const startedAt = Date.now();
    const emit = (event: ResearchEvent): void => this.deps.events?.(event);

    emit({ type: 'run-start', runId, query, maxSources, at: startedAt });

    const search = await this.deps.search(query, {
      engine: opts.engine,
      engines: opts.engines,
      urlTemplate: opts.urlTemplate,
      max: Math.min(maxSources * 3, 25),
    });
    const results = search.results || [];
    emit({
      type: 'search-done',
      runId,
      engine: search.engine ?? null,
      results: results.length,
      blocked: !!search.blocked,
      attempts: (search.attempts || []).length,
      at: Date.now(),
    });
    if (search.blocked) notes.push('A search provider returned a bot-check/consent page.');
    if (!results.length) notes.push('Search returned no results.');

    // Distinct URLs, in rank order.
    const seen = new Set<string>();
    const picked: typeof results = [];
    for (const r of results) {
      if (seen.has(r.url)) continue;
      if (isChallengeUrl(r.url)) continue;
      seen.add(r.url);
      picked.push(r);
      if (picked.length >= maxSources) break;
    }

    const sources: ResearchSource[] = [];
    const tiers: Record<ResearchTier, number> = { llm: 0, static: 0, render: 0 };
    let totalBytes = 0;
    let anchorTotal = 0;
    let cortexIndexed = 0;

    for (const candidate of picked) {
      emit({ type: 'source-start', runId, rank: candidate.rank, url: candidate.url, title: candidate.title, at: Date.now() });
      const gathered = await gatherSource(candidate, {
        runId,
        query,
        excerptChars,
        opts,
        crawl: this.deps.crawl,
        emit,
      });
      cortexIndexed += gathered.cortexIndexed;
      anchorTotal += gathered.anchorCount;
      totalBytes += gathered.source.bytes;
      tiers[gathered.source.via] += 1;
      sources.push(gathered.source);
    }

    const outcome = summarizeRun({
      runId,
      query,
      engine: search.engine,
      sources,
      cortexIndexed,
      bytes: totalBytes,
      tiers,
      anchors: anchorTotal,
      searchAttempts: search.attempts || [],
    });
    emit({
      type: 'run-done',
      runId,
      sources: outcome.sourceCount,
      indexed: outcome.cortexIndexed,
      bytes: outcome.bytes,
      tiers: outcome.tiers,
      humans: outcome.humans,
      anchors: outcome.anchors,
      elapsedMs: Date.now() - startedAt,
      escalations: outcome.escalations,
      notes: outcome.notes,
      at: Date.now(),
    });
    this.deps.log?.('action', `research_topic "${query}" → ${sources.length} source(s), ${cortexIndexed} indexed`);
    return outcome;
  }
}
