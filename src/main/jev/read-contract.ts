/**
 * The page-read funnel contract, shared by the three sides of the JEV gate:
 * the primitives host that declares the hook, the chassis that delegates, and
 * the controller that decides. Inline copies of these types drifted once
 * already; this module is the single declaration.
 */

/** A page read the agent asked for, before the JEV funnel judges it. */
export interface PageReadRequest {
  as: string;
  region?: unknown;
  budget?: number;
  cursor?: unknown;
  full?: boolean;
}

/** Cheap pre-harvest check: refuse an obviously oversized read in ~30 ms. */
export interface PrecheckPageReadResult {
  blocked: boolean;
  note?: string;
  refusal?: Record<string, any>;
}

/** The guard adds the post-harvest facts (tokens, url, title, content). */
export interface GuardPageReadInput extends PageReadRequest {
  pageTokens: number;
  url?: string;
  title?: string;
  content?: string;
}

/** What a refusal names: the page facts, the next call to make, the override. */
export interface PageReadRefusal {
  page: { url: string; tokens: number; sections: number };
  next: Array<Record<string, any>>;
  override: Record<string, any>;
}

export interface GuardPageReadResult {
  allowed: boolean;
  reason: string;
  note?: string;
  refusal?: PageReadRefusal;
}
