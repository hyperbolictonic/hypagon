/**
 * The contracts every primitive shares: what the host must offer, the structured
 * error, and the option/result shapes the tool layer passes in.
 *
 * Portable: this file imports neither Electron nor the app. The host supplies the
 * page operations; the Electron app and any other host implement the same interface.
 */
import type { WaitCondition } from './options.ts';
import type { ComponentSurface } from '../shadow-walk/component-signature.ts';

/** When to use: one mark row a host returns from injectMarks/getMarks. */
export interface HostMark {
  id: number;
  tag: string;
  type?: string;
  text: string;
  role?: string;
  /** Accessibility / widget state flags, e.g. "disabled,expanded=false,checked,required". */
  state?: string;
  /** Current value of form controls (never populated for password inputs). */
  value?: string;
  /** What can be done with this component: click | type | select. Empty when disabled. */
  actions?: string[];
  /** Nearest landmark: header | nav | main | aside | footer | form | dialog | page. */
  region?: string;
  /** Accessible name of that landmark, when it has one. */
  regionName?: string;
  rect: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  /** Component surface when the control belongs to a custom-element host. */
  component?: ComponentSurface;
  /** Set when this mark lives in a child frame (ids 100+). */
  frameId?: string;
  frameUrl?: string;
}

/** When to use: a host's harvested page — the observe(markdown) input. */
export interface PageConstruct {
  url: string;
  title: string;
  timestamp: string;
  rawHtmlLength: number;
  markdownLength: number;
  estimatedTokens: number;
  /** Characters of page text inside the extracted region (same unit as pageChars). */
  extractedChars?: number;
  /** Characters of text in the page body - the denominator for coverage. */
  pageChars?: number;
  /** Which extraction path produced the body. */
  reader?: 'readability' | 'full-body';
  /** Open shadow roots inlined during serialisation. */
  shadowRoots?: number;
  content: string;
}

/** When to use: a ledger record's address mode. */
export type AddressMode = 'mark_id' | 'selector' | 'coords' | 'none';

/** When to use: one form control's facts, recorded with an action. */
export interface FieldFacts {
  tag: string;
  type?: string;
  role?: string;
  /** Accessible-ish name: aria-label, placeholder, name, or id (truncated). */
  name?: string;
  valueLength: number;
  isEmpty: boolean;
  /** The field already held a value before this action. */
  prefilled: boolean;
  editable: boolean;
  required?: boolean;
  disabled?: boolean;
}

/** When to use: a ledger record's target — mark id/selector plus form-control facts. */
export interface TransitionTarget {
  id?: number;
  tag?: string;
  text?: string;
  selector?: string;
  /** Present when the target was a form control (input/textarea/select/contenteditable). */
  field?: FieldFacts;
}

/** When to use: naming the input channel that produced (or was attempted for) a typed value. */
export type TypingChannel = 'keys' | 'insertText' | 'paste';

/**
 * When to use: the evidence a typing action collected (all in-page; the value never leaves the page).
 */
export interface TypingOutcome {
  /** Chars in the control's value before/after. */
  beforeLength: number;
  afterLength: number | null;
  changed: boolean | null;
  /** Trusted key events that reached the page (0 = our input never arrived). */
  keydowns: number;
  beforeinputs: number;
  inputs: number;
  landed: boolean | null;
  /** Which channel produced the winning (or final) attempt. */
  channel?: TypingChannel;
  /** Every channel tried, in order (keys, insertText, paste). */
  attempted?: TypingChannel[];
  /** True when the control was re-rendered mid-type, so no verdict is possible. */
  detached?: boolean;
  /** Typing reached a closed-shadow target; events arrive but its value is unreadable. */
  unobservable?: boolean;
}

/** When to use: one ledger line — what was done, whether the page changed, and the evidence. */
export interface TransitionRecord {
  ts: number;
  action: string;
  addressMode: AddressMode;
  address: string;
  target?: TransitionTarget;
  url: string;
  revisionBefore: number;
  revisionAfter: number;
  marksBefore: number;
  marksAfter: number;
  urlChanged: boolean;
  marksChanged: boolean;
  ok: boolean;
  awaitOk?: boolean;
  hints?: string;
  durationMs: number;
  /** Never the text itself — only how much of it there was. */
  typed?: { chars: number; secret: boolean; landed?: boolean | null };
  clearFirst?: boolean;
  typing?: TypingOutcome;
}

/** When to use: a page read the agent asked for, before the JEV funnel judges it. */
export interface PageReadRequest {
  as: string;
  region?: unknown;
  budget?: number;
  cursor?: unknown;
  full?: boolean;
}

/** When to use: the cheap pre-harvest refusal shape. */
export interface PrecheckPageReadResult {
  blocked: boolean;
  note?: string;
  refusal?: Record<string, any>;
}

/** When to use: the guard input — the read plus the post-harvest facts. */
export interface GuardPageReadInput extends PageReadRequest {
  pageTokens: number;
  url?: string;
  title?: string;
  content?: string;
}

/** When to use: what a refusal names — page facts, the next call and the override. */
export interface PageReadRefusal {
  page: { url: string; tokens: number; sections: number };
  next: Array<Record<string, any>>;
  override: Record<string, any>;
}

/** When to use: the JEV funnel's verdict for a page read. */
export interface GuardPageReadResult {
  allowed: boolean;
  reason: string;
  note?: string;
  refusal?: PageReadRefusal;
}

/** When to use: any screen-space rect the sealed path reports. */
export interface SealedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: one interactive control found under a closed shadow root. */
export interface SealedControl {
  role: string;
  name: string;
  rect: SealedRect;
  actions: string[];
  source: 'ax';
  frameId: string;
  frameUrl?: string;
  inViewport: boolean;
  disabled?: boolean;
  focusable?: boolean;
  focused?: boolean;
  component?: ComponentSurface;
  style?: { sourceUrl?: string; constructed?: boolean };
  token?: string;
}

/** When to use: the `find(sealed:true)` filters. */
export interface SealedFindOptions {
  role?: string;
  name?: string;
  contains?: string;
  regex?: string;
  flags?: string;
  tag?: string;
  selector?: string;
  limit?: number;
  includeOffscreen?: boolean;
  refresh?: boolean;
  revision?: number;
}

/** When to use: the `find(sealed:true)` result. */
export interface SealedFindResult {
  controls: SealedControl[];
  total: number;
  cached: boolean;
  frames: number;
  scannedAt: number;
  notes: string[];
}

/** When to use: the product identity a HAR export records as its creator. */
export interface AppIdentity {
  name: string;
  version: string;
}

/** When to use: a sensitive gate the host detected before a decision call. */
export interface SensitiveGateDetection {
  kind: 'age_verification' | 'captcha';
  evidence: string[];
  reason: string;
}

/** When to use: the chassis — what the primitives may ask of the active tab. */
export interface PrimitivesHost {
  /** Compatibility hook for Electron hosts; the SDK does not use it. */
  webContents?(): unknown;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  evaluate(script: string): Promise<any>;
  harvest(opts: { includeMarks?: boolean; includeOffscreen?: boolean }): Promise<PageConstruct>;
  /**
   * Optional JEV hard-funnel guard. When enforce is on, unscoped markdown/text
   * reads are refused here so the agent is steered to jev_index/read_section.
   */
  guardPageRead?(input: GuardPageReadInput): GuardPageReadResult;
  /** Cheap pre-harvest check so an obviously oversized read is refused in ~30 ms. */
  precheckPageRead?(input: PageReadRequest): Promise<PrecheckPageReadResult>;
  injectMarks(opts?: { includeOffscreen?: boolean }): Promise<HostMark[]>;
  removeMarks(): Promise<void>;
  getMarks(): HostMark[];
  getMarkTarget(id: number): Promise<{ mark: HostMark; currentCenter: { x: number; y: number } } | null>;
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
  /** Optional: the identity a HAR export records as its creator. */
  appIdentity?(): AppIdentity;
  /** Optional: the host's sensitive-gate policy, used by act's gate warning. */
  detectSensitiveGate?(text: string, opts: { url?: string }): SensitiveGateDetection | null;
  /**
   * Optional: persist an executed action's outcome so a runner-side decision model
   * has a local dataset to learn from.
   */
  recordTransition?(record: TransitionRecord): void;
}

/** When to use: a thrown primitive failure — the code the tool layer maps to a hint. */
export type PrimitiveErrorCode = 'STALE_REF' | 'TIMEOUT' | 'NO_TARGET' | 'BAD_REQUEST' | 'NOT_SUPPORTED' | 'AMBIGUOUS' | 'JEV_REQUIRED';

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
  includeFrames?: boolean;
  limit?: number;
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
  sealed?: boolean;
  includeFrames?: boolean;
  refresh?: boolean;
}

/** When to use: act() — the address, the action and the awaited conditions. */
export interface ActOptions {
  markId?: number;
  selector?: string;
  x?: number;
  y?: number;
  targetText?: string;
  sealedToken?: string;
  targetExact?: boolean;
  action: 'click' | 'type' | 'hover' | 'press' | 'focus';
  text?: string;
  secret?: boolean;
  clearFirst?: boolean;
  await?: WaitCondition[];
  timeoutMs?: number;
  dryRun?: boolean;
  includeOffscreen?: boolean;
}
