/**
 * Primitives — the orthogonal observe / act / wait layer.
 *
 * These sit *above* the raw chassis verbs and below the MCP tool catalogue:
 *
 *   observe()  one snapshot model, projected as markdown | text | ax | som | list | table | app_data
 *   act()      one intent model (click/type/hover/press) that returns a delta and can await
 *   wait_for() one readiness model (selector/text/url/role/count/network_idle/stable/revision)
 *   extract()  structured reads (list / table / embedded app data)
 *   collect()  scroll-and-dedupe a virtualized list into rows
 *   find()     semantic lookup -> mark refs
 *   expect()   immediate assertion with evidence
 *   state()/diff()  cheap change detection
 *
 * Everything runs on the humanlike path (real pointer/keyboard events + the existing
 * Set-of-Marks `data-mark-id` stamps); no page DOM is mutated beyond that stamp.
 *
 * Why this file is small: each primitive is its own controller —
 * `observe-controller` (views + frame merge), `find-controller` (marks, sealed
 * roots, frames), `act-controller` (address, perform, verdict), `read-controller`
 * (extract/collect/signature), `wait-controller` (the poll model),
 * `state-controller` (snapshots + diff) and `net-controller` (traffic + HAR).
 * This class wires them and keeps the entry points callers already use.
 *
 * The host interface is implemented by `BrowserChassis`, which keeps this module free
 * of Electron/tab plumbing and independently unit-testable.
 */
import { ActController } from './act-controller.js';
import { FindController } from './find-controller.js';
import { NetController } from './net-controller.js';
import { ObserveController } from './observe-controller.js';
import { PageReadFunnel } from './read-funnel.js';
import { ReadController } from './read-controller.js';
import { StateController } from './state-controller.js';
import { WaitController } from './wait-controller.js';
import type { ActOptions, FindOptions, ObserveOptions, PageState, PrimitivesHost, WaitResult } from './contracts.js';
import type { ExtractOptions, WaitCondition } from './options.js';

export { DEFAULT_MARKDOWN_BUDGET, PrimitiveError } from './contracts.js';
export type {
  ActOptions,
  ConditionResult,
  FindOptions,
  ObserveOptions,
  PageState,
  PrimitiveErrorCode,
  PrimitivesHost,
  WaitResult,
} from './contracts.js';
export type { CollectOptions, ExtractOptions, WaitCondition } from './options.js';

/** When to use: the tool layer and the drive loop — the observe/act/wait/extract/collect facade over the chassis. */
export class Primitives {
  /** Cheap state snapshots and diffs. */
  readonly state: StateController;
  /** wait_for / expect. */
  readonly wait: WaitController;
  /** The observe projections. */
  readonly view: ObserveController;
  /** extract / collect_all / component signatures. */
  readonly read: ReadController;
  /** The find merge over marks, sealed roots and child frames. */
  readonly finder: FindController;
  /** Network reads: recent traffic and the HAR export. */
  readonly net: NetController;

  private readonly actController: ActController;

  constructor(host: PrimitivesHost) {
    this.state = new StateController(host);
    this.wait = new WaitController(host);
    this.read = new ReadController(host);
    this.view = new ObserveController({ host, read: () => this.read, funnel: new PageReadFunnel(host) });
    this.finder = new FindController(host);
    this.net = new NetController(host);
    this.actController = new ActController({
      host,
      waitFor: (conditions, opts) => this.wait.waitFor(conditions, opts),
    });
  }

  public async pageState(): Promise<PageState> {
    return this.state.pageState();
  }

  public async diff(since?: number): Promise<any> {
    return this.state.diff(since);
  }

  public async waitFor(
    conditions: WaitCondition[],
    opts: { timeoutMs?: number; pollMs?: number; require?: 'any' | 'all' } = {},
  ): Promise<WaitResult> {
    return this.wait.waitFor(conditions, opts);
  }

  public async expect(conditions: WaitCondition[]): Promise<WaitResult> {
    return this.wait.expect(conditions);
  }

  public async observe(opts: ObserveOptions = {}): Promise<any> {
    return this.view.observe(opts);
  }

  public async act(opts: ActOptions): Promise<any> {
    return this.actController.run(opts);
  }

  public async find(opts: FindOptions = {}): Promise<any> {
    return this.finder.find(opts);
  }

  public async extract(opts: ExtractOptions): Promise<any> {
    return this.read.extract(opts);
  }

}
