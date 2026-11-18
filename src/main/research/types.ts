/**
 * Public research types: the options, one gathered source, the run outcome and the
 * injectable dependencies.
 *
 * Leaf module: the researcher, the gatherer and the bridge all reference these
 * without importing each other.
 *
 * When to use: typing a `research_topic` call/result, or injecting search/crawl
 * dependencies into a Researcher.
 */

import type { CitationAnchor } from './anchors.js';
import type { SearchAttempt, SearchOutcome } from '../search/search-engine.js';
import type { CrawlOptions, CrawlOutcome } from '../crawl/crawler.js';
import type { ResearchEvent, ResearchEscalation, ResearchTier } from '../../shared/research-events.js';

/** When to use: shaping `research_topic` (query, depth, source cap, harvest). */
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
  /** Try the impersonating static fetch before rendering (default true). */
  preferStatic?: boolean;
  /** Anchor matching blocks to fingerprints for later relocation (default true). */
  anchors?: boolean;
  /** Politeness delay between gathered sources (default 0; stealth mode raises it). */
  delayMs?: number;
}

/** When to use: reading one gathered source (URL, title, text, highlights). */
export interface ResearchSource {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  via: 'llm' | 'static' | 'render';
  bytes: number;
  indexed: boolean;
  /** True when a human cleared a challenge for this source. */
  humanAssisted?: boolean;
  /** Time spent waiting for the human (included in `ms`). */
  humanMs?: number;
  /** Fingerprints for the DOM blocks behind the highlights. */
  anchors?: CitationAnchor[];
  /** Wall-clock time spent fetching/distilling this source. */
  ms?: number;
  highlights: string[];
  error?: string;
  /** Set when a cheaper tier failed and the page had to be rendered instead. */
  escalation?: ResearchEscalation;
}

/** When to use: returning the research result (sources, notes, blocked/assist info). */
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
  /** Sources a human had to unblock. */
  humans: number;
  /** Total citation anchors captured across sources. */
  anchors: number;
  /** Sources that needed a render after a cheaper tier failed. Surfaced for the calling agent. */
  escalations: number;
  searchAttempts: SearchAttempt[];
  notes: string[];
}

/** When to use: injecting search/fetch/cortex dependencies when constructing a Researcher. */
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
