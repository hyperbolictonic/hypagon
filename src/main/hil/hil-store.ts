/**
 * The human-in-the-loop request state: the pending request, its timeout, the
 * resolver and the history.
 *
 * Why a module: the manager's lifecycle methods were dominated by this state
 * machine, which has nothing to do with Electron. Keeping it free of Electron
 * imports means the transitions (resolve, cancel, timeout, history) can be
 * exercised directly.
 */
import type { HilRequest, HilResolution } from './hil-types.js';

/** When to use: `HilManager` — one store per process. */
export class HilRequestStore {
  private active: HilRequest | null = null;
  private resolver: ((res: HilResolution) => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private history: HilRequest[] = [];
  private onClosed: (() => void) | null = null;

  /**
   * When to use: `requestIntervention` — makes the request active, arms the
   * timeout and returns the promise the caller awaits. `onClosed` runs once,
   * whatever ends the request, before the promise settles.
   */
  begin(request: HilRequest, onClosed: () => void): Promise<HilResolution> {
    this.active = request;
    this.onClosed = onClosed;
    return new Promise<HilResolution>((resolve) => {
      this.resolver = resolve;
      this.timer = setTimeout(() => {
        if (this.active?.id !== request.id || this.active.status !== 'pending') return;
        const closed = this.active;
        closed.status = 'timeout';
        closed.resolvedAt = Date.now();
        const elapsed = Math.round((Date.now() - closed.requestedAt) / 1000);
        this.finish(closed, {
          status: 'timeout',
          elapsedSeconds: elapsed,
          notes: `Human intervention timed out after ${elapsed} seconds.`,
        });
      }, request.timeoutSeconds * 1000);
    });
  }

  /**
   * Close the pending request. Resolve and cancel share the whole teardown; they
   * differ only in the status, the request notes and the resolver's message.
   */
  close(
    id: string | undefined,
    status: 'resolved' | 'cancelled',
    requestNotes: string | undefined,
    resolverNotes: string,
  ): boolean {
    if (!this.active || this.active.status !== 'pending') return false;
    if (id && this.active.id !== id) return false;

    const closed = this.active;
    closed.status = status;
    closed.resolvedAt = Date.now();
    if (requestNotes !== undefined) closed.notes = requestNotes;
    const elapsed = Math.round((Date.now() - closed.requestedAt) / 1000);
    this.finish(closed, { status, elapsedSeconds: elapsed, notes: resolverNotes });
    return true;
  }

  /** The pending request, or null when nothing is waiting on a human. */
  activeRequest(): HilRequest | null {
    return this.active;
  }

  /** Completed requests, oldest first. */
  entries(): HilRequest[] {
    return [...this.history];
  }

  private finish(closed: HilRequest, resolution: HilResolution): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const resolver = this.resolver;
    const onClosed = this.onClosed;
    this.active = null;
    this.resolver = null;
    this.onClosed = null;
    this.history.push(closed);
    onClosed?.();
    resolver?.(resolution);
  }
}
