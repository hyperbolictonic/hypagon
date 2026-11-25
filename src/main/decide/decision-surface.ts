/**
 * Decision surface.
 *
 * Owns the decision-event ring and the human hand-off the guard raises when it
 * cannot clear its threshold. The chassis supplies the HIL surface and the
 * current page URL; nothing here decides what is right.
 */
import type { DecisionEvent } from './decision-client.js';
import type { HilSurface } from '../hil/hil-surface.js';

/** Dependencies the decision surface needs from the HIL layer. */
export interface DecisionSurfaceDeps {
  hil(): HilSurface;
  pageUrl(): string;
}

/** The decision log and the guard-driven human hand-off. */
export class DecisionSurface {
  private readonly log: DecisionEvent[] = [];
  private readonly deps: DecisionSurfaceDeps;

  constructor(deps: DecisionSurfaceDeps) {
    this.deps = deps;
  }

  /** Record one decision call; the ring lets a late renderer catch up. */
  record(event: DecisionEvent): void {
    this.log.push(event);
    if (this.log.length > 50) this.log.shift();
  }

  events(): DecisionEvent[] {
    return this.log;
  }

  /**
   * A sensitive gate needs a person. Raise the hand-off from Kuang itself rather than relying on the
   * caller to do it: the rule already decided that a human is required, so waiting for another round
   * trip only wastes the agent's turn. Skipped while a request is already open.
   */
  async requestForGate(gate: { kind?: string; reason: string; evidence?: string[] }, url?: string): Promise<void> {
    // Only one request at a time: while one is open the human is already being asked. Once it is
    // resolved, a fresh gate may ask again — that is the correct behaviour, not spam, because the
    // human explicitly cleared the previous request.
    const hil = this.deps.hil();
    if (hil.manager.getActiveRequest()) return;
    const pageUrl = url || this.deps.pageUrl();
    const detail = gate.evidence && gate.evidence.length ? ` — matched: ${gate.evidence.join(' | ')}` : '';
    await hil.request(`${gate.reason}${detail}`, { url: pageUrl, bringToFront: true }).catch(() => null);
  }

  /**
   * A guarded decision that cannot clear its threshold is a HUMAN decision, not an agent guess.
   * Raise the HIL banner (with the options) and hand the caller a `human_required` result so it
   * stops instead of acting on a coin flip. Non-blocking: the request is registered synchronously,
   * and the promise is left to resolve when the person acts or the request times out.
   */
  requestForDecision(
    info: { question?: string; options?: string[]; confidence?: number; reasons?: string[] },
    url?: string,
  ): string | null {
    const hil = this.deps.hil();
    const existing = hil.manager.getActiveRequest();
    if (existing) return existing.id; // already asking the human; do not stack requests

    const pageUrl = url || this.deps.pageUrl();
    const options = (info.options || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
    const bits = [
      info.question ? `Decision needed: ${info.question}` : 'Decision needed',
      options.length ? `Options: ${options.map((o) => `"${o}"`).join(', ')}` : '',
      typeof info.confidence === 'number' ? `(model confidence ${info.confidence.toFixed(2)})` : '',
      info.reasons?.length ? `— ${info.reasons.slice(0, 2).join('; ')}` : '',
    ].filter(Boolean);
    const reason = bits.join(' ').slice(0, 400);

    const pending = hil.request(reason, { url: pageUrl, bringToFront: true, timeoutSeconds: 300 });
    const id = hil.manager.getActiveRequest()?.id ?? null;
    void pending.catch(() => null); // resolves when the human acts; we do not block the HTTP call
    return id;
  }
}
