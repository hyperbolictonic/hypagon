/**
 * Turning a finished source list into the research outcome: totals, notes and the
 * extractive-only reminder.
 *
 * Pure aggregation — no I/O, no events — so the run loop stays orchestration and the
 * wording of the caller-facing notes lives in one reviewable place.
 *
 * When to use: finishing a `research_topic` run, or testing how sources roll up into
 * counts and notes.
 */

import type { ResearchTier } from '../../shared/research-events.js';
import type { SearchAttempt } from '../search/search-engine.js';
import type { ResearchOutcome, ResearchSource } from './types.js';

/** When to use: the run totals the outcome is assembled from. */
export interface SummaryInput {
  runId: string;
  query: string;
  engine: string | null;
  sources: ResearchSource[];
  cortexIndexed: number;
  bytes: number;
  tiers: Record<ResearchTier, number>;
  anchors: number;
  searchAttempts: SearchAttempt[];
}

/** When to use: rolling a finished source list up into the outcome plus its notes. */
export function summarizeRun(input: SummaryInput): ResearchOutcome {
  const notes: string[] = [];
  const escalations = input.sources.filter((source) => source.escalation).length;
  const humans = input.sources.filter((source) => source.humanAssisted).length;

  if (escalations > 0) {
    notes.push(
      `${escalations} source(s) were rendered after a cheaper tier failed — see each source's "escalation".`,
    );
  }
  if (humans > 0) {
    notes.push(`${humans} source(s) required human intervention to clear a challenge.`);
  }
  if (input.sources.length && !input.sources.some((s) => s.highlights.length)) {
    notes.push('No query-term highlights found in the gathered sources — try broader terms or more sources.');
  }
  notes.push('Extractive only: sources are distilled and cited, but no prose is synthesized — the caller writes the answer.');

  return {
    runId: input.runId,
    query: input.query,
    engine: input.engine,
    sources: input.sources,
    sourceCount: input.sources.length,
    cortexIndexed: input.cortexIndexed,
    bytes: input.bytes,
    tiers: input.tiers,
    humans,
    anchors: input.anchors,
    escalations,
    searchAttempts: input.searchAttempts,
    notes,
  };
}
