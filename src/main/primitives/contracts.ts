/**
 * The contracts every primitive shares: what the host must offer, the structured
 * error, and the option/result shapes the tool layer passes in.
 *
 * Why a module: the controllers under `primitives/` need these types and the
 * error class, and they must not import `primitives.ts` — that would be a cycle
 * (and the import gate counts type-only edges too). `primitives.ts` re-exports
 * everything here, so callers keep importing from the same place.
 */
import type { WebContents } from 'electron';
import type { HarvestedConstruct } from '../../shared/types.js';
import type { MarkItem } from '../marks/marks-overlay.js';
import type { TransitionRecord } from '../telemetry/action-ledger.js';
import type {
  GuardPageReadInput,
  GuardPageReadResult,
  PageReadRequest,
  PrecheckPageReadResult,
} from '../jev/read-contract.js';
import type { SealedFindOptions, SealedFindResult } from '../shadow-walk/ax-controls.js';
import type { WaitCondition } from './options.js';

/** When to use: the chassis — what the primitives may ask of the active tab. */
export interface PrimitivesHost {
  webContents(): WebContents;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  evaluate(script: string): Promise<any>;
  harvest(opts: { includeMarks?: boolean; includeOffscreen?: boolean }): Promise<HarvestedConstruct>;
  /**
   * Optional JEV hard-funnel guard. When enforce is on, unscoped markdown/text
   * reads are refused here so the agent is steered to jev_index/read_section.
   */
  guardPageRead?(input: GuardPageReadInput): GuardPageReadResult;
  /** Cheap pre-harvest check so an obviously oversized read is refused in ~30 ms. */
  precheckPageRead?(input: PageReadRequest): Promise<PrecheckPageReadResult>;
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

/** When to use: a thrown primitive failure — the code the tool layer maps to a hint. */
export type PrimitiveErrorCode = 'STALE_REF' | 'TIMEOUT' | 'NO_TARGET' | 'BAD_REQUEST' | 'NOT_SUPPORTED' | 'AMBIGUOUS' | 'JEV_REQUIRED';

/**
 * Default view size for `observe(as:"markdown")` when the caller gives no budget.
 * The full construct is retained and pageable with next_cursor; pass budget=0
 * to receive the whole thing in one response.
 */
/** When to use: observe(markdown) — the default view size when the caller gives no budget. */
export const DEFAULT_MARKDOWN_BUDGET = 25000;

/** When to use: every refusal the primitives raise — code, message and optional detail. */
export class PrimitiveError extends Error {
  public code: PrimitiveErrorCode;
  public detail?: any;
  constructor(code: PrimitiveErrorCode, message: string, detail?: any) {
    super(message);
    this.name = 'PrimitiveError';
    this.code = code;
    this.detail = detail;
  }
}


/** When to use: wait_for — one condition’s outcome and evidence. */
export interface ConditionResult {
  type: string;
  ok: boolean;
  evidence?: string;
}

/** When to use: wait_for / expect — the whole poll result. */
export interface WaitResult {
  ok: boolean;
  require: 'any' | 'all';
  waitedMs: number;
  attempts: number;
  results: ConditionResult[];
}

/** When to use: page_state — the cheap identity snapshot diff() compares. */
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

/** When to use: observe() — the view, the region, the budget and the JEV switch. */
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



/** When to use: find() — the semantic query and the optional sources. */
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
/** When to use: act() — the address, the action and the awaited conditions. */
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
