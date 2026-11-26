/**
 * The cheap change detection: page state snapshots and the diff between them.
 *
 * Why a module: `pageState` records a bounded history and `diff` compares against
 * it. That is one small state machine, and it has nothing to do with observe/act.
 */
import { SIGNATURE_SCRIPT } from './page-scripts.js';
import type { PageState, PrimitivesHost } from './contracts.js';

/** When to use: `Primitives` — the state()/diff() pair. */
export class StateController {
  private readonly host: PrimitivesHost;
  private readonly states = new Map<number, PageState>();
  private readonly stateOrder: number[] = [];

  constructor(host: PrimitivesHost) {
    this.host = host;
  }

  public async pageState(): Promise<PageState> {
    const dom = await this.host.evaluate(SIGNATURE_SCRIPT).catch(() => ({} as any));
    const info = this.host.getPageInfo();
    const state: PageState = {
      revision: this.host.revision(),
      url: dom?.url || info.url || '',
      title: dom?.title || info.title || '',
      isLoading: Boolean(info.isLoading),
      marks: this.host.getMarks().length,
      nodeCount: dom?.nodeCount || 0,
      height: dom?.height || 0,
      scrollY: dom?.scrollY || 0,
      textLen: dom?.textLen || 0,
      textHash: dom?.textHash || 0,
      ts: Date.now(),
    };
    this.remember(state);
    return state;
  }

  public async diff(since?: number): Promise<any> {
    const to = await this.pageState();
    const target = since === undefined ? this.earliestRevision() : since;
    let from = this.states.get(target);
    if (!from) {
      let best: number | null = null;
      for (const rev of this.stateOrder) {
        if (rev <= target && (best === null || rev > best)) best = rev;
      }
      if (best !== null) from = this.states.get(best);
    }
    if (!from) {
      return { from: null, to, changed: true, changes: {}, note: 'no baseline state recorded for that revision' };
    }
    const changes: Record<string, { from: any; to: any }> = {};
    const keys: (keyof PageState)[] = ['url', 'title', 'marks', 'nodeCount', 'height', 'scrollY', 'textLen', 'textHash'];
    for (const k of keys) {
      if (from[k] !== to[k]) changes[k] = { from: from[k], to: to[k] };
    }
    return { from, to, changed: Object.keys(changes).length > 0, changes };
  }

  private remember(state: PageState) {
    if (!this.states.has(state.revision)) this.stateOrder.push(state.revision);
    this.states.set(state.revision, state);
    while (this.stateOrder.length > 60) {
      const oldest = this.stateOrder.shift();
      if (oldest !== undefined) this.states.delete(oldest);
    }
  }

  private earliestRevision(): number {
    return this.stateOrder.length ? this.stateOrder[0] : this.host.revision();
  }
}
