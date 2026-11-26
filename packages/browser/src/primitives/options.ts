/**
 * The option shapes the injected page programs read.
 *
 * Why a module: `page-scripts.ts` renders these into the browser, and
 * `primitives.ts` accepts them from the tool layer. Keeping them beside either
 * one would make those two import each other.
 */

/** When to use: wait_for and expect — one declarative readiness condition. */
export interface WaitCondition {
  type:
    | 'selector'
    | 'gone'
    | 'text'
    | 'url'
    | 'role_name'
    | 'count'
    | 'network_idle'
    | 'stable'
    | 'revision';
  selector?: string;
  text?: string;
  pattern?: string;
  regex?: string;
  flags?: string;
  role?: string;
  name?: string;
  visible?: boolean;
  min?: number;
  max?: number;
  equals?: number;
  /** stable target: what must stop changing */
  target?: 'marks' | 'height' | 'text' | 'nodes';
  /** for network_idle: how long with no new request (ms) */
  quietMs?: number;
  /** for stable: how long the value must hold (ms) */
  holdMs?: number;
  /** for revision: minimum revision */
  version?: number;
}

/** When to use: extract() — which structure to read and where. */
export interface ExtractOptions {
  kind: 'list' | 'table' | 'tables' | 'app_data' | 'schema_org';
  ref?: number;
  selector?: string;
  /** schema_org only: filter to a single schema.org @type (case-insensitive, e.g. "Recipe"). */
  type?: string;
  limit?: number;
  /** Also run the extraction in child frames and return per-frame results. */
  includeFrames?: boolean;
  maxFrames?: number;
  timeoutMs?: number;
}

/** When to use: collect_all() — which container to scroll and how far. */
export interface CollectOptions {
  ref?: number;
  selector?: string;
  scroll?: 'container' | 'window';
  step?: number;
  delayMs?: number;
  maxScrolls?: number;
  max?: number;
}
