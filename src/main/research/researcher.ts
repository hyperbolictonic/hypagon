/**
 * `research_topic` — autonomous research mode (TODO_RESEARCH_CRAWL.md §5, Feature 3).
 *
 * search → fetch the top sources (cheap `llm` path first) → distill to Markdown → index into
 * LanceDB Cortex → return **extractive**, cited evidence.
 *
 * It is deliberately **not** a summarizer: Kuang has no LLM, so the tool gathers and ranks cited
 * evidence (per-source highlights are paragraphs from the sources that mention the query terms)
 * and leaves the prose synthesis to the calling agent. Sources are indexed into Cortex so the
 * agent can follow up with `recall_memory`.
 */
import { randomUUID } from 'node:crypto';

import type { ResearchEvent, ResearchEscalation, ResearchTier } from '../../shared/research-events.js';
import type { SearchOutcome, SearchAttempt } from '../search/search-engine.js';
import type { CrawlOptions, CrawlOutcome } from '../crawl/crawler.js';

export interface ResearchOptions {
  query: string;
  /** Distinct sources to gather (default 5, max 8). */
  maxSources?: number;
  engine?: string;
  engines?: string[];
  urlTemplate?: string;
  /** Chars of each source kept for highlighting (default 1200, max 4000). */
  excerptChars?: number;
  /** Index each source into LanceDB Cortex (default true). */
  harvestToCortex?: boolean;
  /** Try content-negotiated Markdown/Text before rendering (default true). */
  preferLlm?: boolean;
  /** Politeness delay between gathered sources (default 0; stealth mode raises it). */
  delayMs?: number;
}

export interface ResearchSource {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  via: 'llm' | 'static' | 'render';
  bytes: number;
  indexed: boolean;
  /** Wall-clock time spent fetching/distilling this source. */
  ms?: number;
  highlights: string[];
  error?: string;
  /** Set when a cheaper tier failed and the page had to be rendered instead. */
  escalation?: ResearchEscalation;
}

export interface ResearchOutcome {
  runId: string;
  query: string;
  engine: string | null;
  sources: ResearchSource[];
  sourceCount: number;
  cortexIndexed: number;
  /** Total distilled bytes across sources. */
  bytes: number;
  /** How many sources used each acquisition tier. */
  tiers: Record<ResearchTier, number>;
  /** Sources that needed a render after a cheaper tier failed. Surfaced for the calling agent. */
  escalations: number;
  searchAttempts: SearchAttempt[];
  notes: string[];
}

export interface ResearcherDeps {
  search: (
    query: string,
    opts: { engine?: string; engines?: string[]; urlTemplate?: string; max?: number },
  ) => Promise<SearchOutcome>;
  crawl: (opts: CrawlOptions) => Promise<CrawlOutcome>;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Live run events (timeline/UI). Escalations are also carried on the outcome. */
  events?: (event: ResearchEvent) => void;
}

function coded(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
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
      seen.add(r.url);
      picked.push(r);
      if (picked.length >= maxSources) break;
    }

    const sources: ResearchSource[] = [];
    const tiers: Record<ResearchTier, number> = { llm: 0, static: 0, render: 0 };
    let totalBytes = 0;
    let cortexIndexed = 0;

    for (const r of picked) {
      emit({ type: 'source-start', runId, rank: r.rank, url: r.url, title: r.title, at: Date.now() });
      try {
        const crawled = await this.deps.crawl({
          startUrl: r.url,
          maxDepth: 0,
          maxPages: 1,
          delayMs: opts.delayMs ?? 0,
          preferLlm: opts.preferLlm !== false,
          harvestToCortex: opts.harvestToCortex !== false,
          includeContent: excerptChars,
        });
        const page = crawled.pages[0];
        cortexIndexed += crawled.cortexIndexed;
        const excerpt = page?.excerpt || '';
        const via = page?.via || 'render';
        const bytes = page?.bytes || 0;
        const indexed = !!page?.indexed;
        const escalation = page?.escalation;
        const highlights = extractHighlights(excerpt, query, 3);
        const ms = page?.ms ?? 0;
        const title = page?.title || r.title;
        totalBytes += bytes;
        tiers[via] += 1;
        sources.push({
          rank: r.rank,
          title,
          url: r.url,
          snippet: r.snippet,
          via,
          bytes,
          ms,
          indexed,
          highlights,
          error: page?.error,
          escalation,
        });
        emit({
          type: 'source-done',
          runId,
          rank: r.rank,
          url: r.url,
          title,
          via,
          bytes,
          ms,
          highlights: highlights.length,
          indexed,
          escalation,
          error: page?.error,
          at: Date.now(),
        });
      } catch (err: any) {
        const message = err?.message || String(err);
        sources.push({
          rank: r.rank,
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          via: 'render',
          bytes: 0,
          indexed: false,
          highlights: [],
          error: message,
        });
        emit({
          type: 'source-done',
          runId,
          rank: r.rank,
          url: r.url,
          title: r.title,
          via: 'render',
          bytes: 0,
          ms: 0,
          highlights: 0,
          indexed: false,
          error: message,
          at: Date.now(),
        });
      }
    }

    const escalations = sources.filter((source) => source.escalation).length;
    if (escalations > 0) {
      notes.push(
        `${escalations} source(s) were rendered after a cheaper tier failed — see each source's "escalation".`,
      );
    }

    if (sources.length && !sources.some((s) => s.highlights.length)) {
      notes.push('No query-term highlights found in the gathered sources — try broader terms or more sources.');
    }
    notes.push('Extractive only: sources are distilled and cited, but no prose is synthesized — the caller writes the answer.');

    const outcome: ResearchOutcome = {
      runId,
      query,
      engine: search.engine,
      sources,
      sourceCount: sources.length,
      cortexIndexed,
      bytes: totalBytes,
      tiers,
      escalations,
      searchAttempts: search.attempts || [],
      notes,
    };
    emit({
      type: 'run-done',
      runId,
      sources: sources.length,
      indexed: cortexIndexed,
      bytes: totalBytes,
      tiers,
      elapsedMs: Date.now() - startedAt,
      escalations,
      notes,
      at: Date.now(),
    });
    this.deps.log?.('action', `research_topic "${query}" → ${sources.length} source(s), ${cortexIndexed} indexed`);
    return outcome;
  }
}
