/**
 * Primitives part: page-state.
 */
import type { PageState } from './types.js';
import { SIGNATURE_SCRIPT } from './scripts-wait.js';
import { PrimitivesBase } from './base.js';

/** When to use: the page-state part of the primitives chain, composed into the public class. */
export class PrimitivesPageState extends PrimitivesBase {

  // ---- state / diff --------------------------------------------------------

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
}
