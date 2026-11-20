/**
 * The primitives' published vocabulary: the host the chassis injects, the options each
 * primitive accepts, the wait-condition grammar, and the error codes the bridge maps to HTTP.
 *
 * Kept apart from the implementations so a caller can type a primitive without importing the
 * DOM scripts.
 */
import type { WebContents } from 'electron';
import type { HarvestedConstruct } from '../../shared/types.js';
import type { MarkItem } from '../marks/marks-overlay.js';
import type { TransitionRecord } from '../telemetry/action-ledger.js';
import type { SealedFindOptions, SealedFindResult } from '../shadow-walk/ax-controls.js';

/** When to use: the cheap JEV pre-harvest check (a subset of the full guard input). */
export interface PageReadPrecheckInput {
  as: string;
  region?: unknown;
  budget?: number;
  cursor?: unknown;
  full?: boolean;
}

/** When to use: the JEV hard-funnel guard, which also weighs the projected page tokens. */
export interface PageReadGuardInput extends PageReadPrecheckInput {
  pageTokens: number;
  url?: string;
  title?: string;
  content?: string;
}

/** When to use: implementing the primitives' host (BrowserChassis does) or typing a test double. */
export interface PrimitivesHost {
  webContents(): WebContents;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  evaluate(script: string): Promise<any>;
  harvest(opts: { includeMarks?: boolean; includeOffscreen?: boolean }): Promise<HarvestedConstruct>;
  /**
   * Optional JEV hard-funnel guard. When enforce is on, unscoped markdown/text
   * reads are refused here so the agent is steered to jev_index/read_section.
   */
  guardPageRead?(input: PageReadGuardInput): {
    allowed: boolean;
    reason: string;
    note?: string;
    refusal?: Record<string, any>;
  };
  /** Cheap pre-harvest check so an obviously oversized read is refused in ~30 ms. */
  precheckPageRead?(input: PageReadPrecheckInput): Promise<{ blocked: boolean; note?: string; refusal?: Record<string, any> }>;
  injectMarks(opts?: { includeOffscreen?: boolean }): Promise<MarkItem[]>;
  removeMarks(): Promise<void>;
  getMarks(): MarkItem[];
  getMarkTarget(id: number): Promise<{ mark: MarkItem; currentCenter: { x: number; y: number } } | null>;
  clickMark(id: number): Promise<string>;
  typeMark(id: number, text: string, opts?: { secret?: boolean; clearFirst?: boolean }): Promise<string>;
  /** Closed-shadow-root discovery. Optional so test hosts can omit the CDP surface. */
  findSealed?(opts: SealedFindOptions): Promise<SealedFindResult>;
  /** Whether component signatures may be attached to find/observe results. */
  componentSurfaceEnabled?(): boolean;
  /** Optional frame scan for `find(include_frames)` / mark ids. */
  getFrames?(opts: any): Promise<{ frames: any[]; notes?: string[] }>;
  /** Optional per-frame evaluation (used by extract(include_frames)). */
  evaluateInFrames?(script: string, opts?: { maxFrames?: number; timeoutMs?: number }): Promise<Array<{
    frameId: string;
    url?: string;
    name?: string;
    depth?: number;
    oopif?: boolean;
    ok: boolean;
    value?: any;
    error?: string;
  }>>;
  /** Resolve an opaque sealed token to a live, scrolled target centre. */
  resolveSealedToken?(token: string): Promise<{ center: { x: number; y: number }; rect: { x: number; y: number; width: number; height: number }; frameId: string } | null>;
  clickElement(selector?: string, coordinates?: { x: number; y: number }): Promise<string>;
  typeText(text: string, selector?: string, opts?: { clearFirst?: boolean }): Promise<string>;
  /** CDP text insertion — no key events. Fallback when keystrokes are provably ignored. */
  insertText(text: string): Promise<boolean>;
  /** Clipboard paste into the focused control, restoring the previous clipboard. */
  pasteText(text: string): Promise<boolean>;
  moveMouseTo(target: { x: number; y: number }): Promise<void>;
  pressKey(key: string): Promise<string>;
  snapshotRenderedPage(opts: any): Promise<any>;
  getNetworkTraffic(filter?: any): any[];
  getPageInfo(): { url: string; title: string; isLoading: boolean; activeTabId?: string };
  revision(): number;
  windowFocused?(): boolean;
  /**
   * Optional: persist an executed action's outcome (state, target, delta, hints) so a runner-side
   * decision model has a local dataset to learn from. Implemented by BrowserChassis → ActionLedger.
   */
  recordTransition?(record: TransitionRecord): void;
}

/** When to use: branching on a primitive failure; the codes map to bridge HTTP statuses. */
export type PrimitiveErrorCode = 'STALE_REF' | 'TIMEOUT' | 'NO_TARGET' | 'BAD_REQUEST' | 'NOT_SUPPORTED' | 'AMBIGUOUS' | 'JEV_REQUIRED';

/**
 * Default view size for `observe(as:"markdown")` when the caller gives no budget.
 * The full construct is retained and pageable with next_cursor; pass budget=0
 * to receive the whole thing in one response.
 */
export const DEFAULT_MARKDOWN_BUDGET = 25000;

/** When to use: describing one wait_for/expect condition (selector, text, url, count, ...). */
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

/** When to use: reading the per-condition outcome of wait_for/expect. */
export interface ConditionResult {
  type: string;
  ok: boolean;
  evidence?: string;
}

/** When to use: returning the aggregate wait verdict (ok, attempts, elapsed, results). */
export interface WaitResult {
  ok: boolean;
  require: 'any' | 'all';
  waitedMs: number;
  attempts: number;
  results: ConditionResult[];
}

/** When to use: comparing revisions, URLs and text lengths for the diff primitive. */
export interface PageState {
  revision: number;
  url: string;
  title: string;
  isLoading: boolean;
  marks: number;
  nodeCount: number;
  height: number;
  scrollY: number;
  textLen: number;
  textHash: number;
  ts: number;
}

/** When to use: shaping observe output (format, region, budget, cursor, frames). */
export interface ObserveOptions {
  as?: 'markdown' | 'text' | 'ax' | 'som' | 'components' | 'list' | 'table' | 'app_data';
  region?: number | string;
  budget?: number;
  cursor?: string | number;
  includeOffscreen?: boolean;
  /** Merge child-frame controls (100+ ids) into som/components projections. */
  includeFrames?: boolean;
  limit?: number;
  /** Explicit JEV bypass: serve the full read even while enforce is on (logged). */
  full?: boolean;
}

/** When to use: shaping extract (list, table, tables, app_data, schema_org). */
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

/** When to use: shaping collect_all (container, scroll step, delay, max scrolls). */
export interface CollectOptions {
  ref?: number;
  selector?: string;
  scroll?: 'container' | 'window';
  step?: number;
  delayMs?: number;
  maxScrolls?: number;
  max?: number;
}

/** When to use: shaping find (role/name/text/regex/selector, offscreen, frames). */
export interface FindOptions {
  role?: string;
  name?: string;
  contains?: string;
  regex?: string;
  flags?: string;
  tag?: string;
  selector?: string;
  limit?: number;
  includeOffscreen?: boolean;
  /** Also search inside closed shadow roots (AX + pierced DOM; opt-in and rate-limited). */
  sealed?: boolean;
  /** Also search controls inside child frames (same-site and OOPIF) and return 100+ mark ids. */
  includeFrames?: boolean;
  /** Force a fresh sealed scan instead of using the short identity cache. */
  refresh?: boolean;
}

/**
 * A target can be addressed three ways, in order of preference:
 *   mark_id (set-of-marks badge, resilient to layout shifts) > selector > viewport x/y.
 */
export interface ActOptions {
  markId?: number;
  selector?: string;
  x?: number;
  y?: number;
  /** Anchor by visible text — for controls with no semantics (React cards, divs with handlers). */
  targetText?: string;
  /** Opaque token from a sealed result; resolves, scrolls, and re-measures the offscreen control. */
  sealedToken?: string;
  /** Require an exact (trimmed) text match instead of substring. */
  targetExact?: boolean;
  action: 'click' | 'type' | 'hover' | 'press' | 'focus';
  text?: string;
  secret?: boolean;
  /** Clear the field before typing (select-all + delete) so a pre-filled value is replaced, not appended to. */
  clearFirst?: boolean;
  await?: WaitCondition[];
  timeoutMs?: number;
  dryRun?: boolean;
  includeOffscreen?: boolean;
}
