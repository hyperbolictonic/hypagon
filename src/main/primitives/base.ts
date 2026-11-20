/**
 * Base of the primitives chain: the injected host, the per-revision state cache, and the two
 * helpers every other part relies on.
 */
import type { PrimitivesHost, PageState } from './types.js';

/** When to use: the base part of the primitives chain, composed into the public class. */
export class PrimitivesBase {
  protected states: Map<number, PageState> = new Map();
  protected stateOrder: number[] = [];
  protected prevStable: Record<string, { value: number; since: number }> = {};

  constructor(protected host: PrimitivesHost) {}


  protected remember(state: PageState) {
    if (!this.states.has(state.revision)) this.stateOrder.push(state.revision);
    this.states.set(state.revision, state);
    while (this.stateOrder.length > 60) {
      const oldest = this.stateOrder.shift();
      if (oldest !== undefined) this.states.delete(oldest);
    }
  }


  protected earliestRevision(): number {
    return this.stateOrder.length ? this.stateOrder[0] : this.host.revision();
  }
}
