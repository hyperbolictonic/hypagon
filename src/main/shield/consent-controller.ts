/**
 * The consent sweep: answer a consent wall the way a person would, once per
 * origin, and stop.
 *
 * Why a module: the answered-origins memory, the timed sweep after a
 * navigation, and the explicit dismiss (the only path allowed the last-resort
 * DOM removal) were chassis fields and methods that only made sense together.
 *
 * Deliberately narrower than the old three-pass sweep: a repeated click on a
 * CMP that re-renders is what made the banner flicker on/off, and auto-removing
 * it is not a human behaviour. So:
 *  - one attempt after the page settles, at a few settle points (walls often
 *    mount after load: a hydration delay, or after a login/redirect),
 *  - the least invasive real option (reject/only-necessary before accept),
 *  - if it reappears, remember the origin and leave it alone,
 *  - never strip the DOM from here (`forceRemove` is only for an explicit
 *    dismiss_consent call).
 */
import type { WebContents } from 'electron';
import type { ShieldBreaker, ShieldDismissResult, ConsentPolicy } from '../shield/shield-breaker.js';
import type { TelemetryEvent } from '../../shared/types.js';

/** When to use: building the chassis — the wall breaker, the policy and the log/telemetry come from it. */
export interface ConsentControllerDeps {
  activeWebContents: () => WebContents;
  shieldBreaker: () => ShieldBreaker;
  /** How to answer a wall: essential | accept | reject. */
  policy: () => ConsentPolicy;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  telemetry: (event: TelemetryEvent) => void;
}

/** When to use: the chassis — own the consent sweep: answered-origins memory, timed attempts and the explicit dismiss. */
export class ConsentController {
  private readonly deps: ConsentControllerDeps;
  /** Origins whose wall has already been answered (or deliberately left) this session. */
  private answeredOrigins = new Set<string>();
  private sweepTimers: NodeJS.Timeout[] = [];

  constructor(deps: ConsentControllerDeps) {
    this.deps = deps;
  }

  clearSweep(): void {
    for (const timer of this.sweepTimers) clearTimeout(timer);
    this.sweepTimers = [];
  }

  /** Schedule late consent attempts after a navigation; replaces any sweep already pending. */
  scheduleSweep(delays: number[] = [900, 2600, 6000]): void {
    this.clearSweep();
    for (const delay of delays) {
      const timer = setTimeout(() => {
        void this.sweep();
      }, delay);
      timer.unref?.();
      this.sweepTimers.push(timer);
    }
  }

  private async sweep(): Promise<void> {
    let wc: WebContents;
    try {
      wc = this.deps.activeWebContents();
    } catch {
      return;
    }
    if (!wc || wc.isDestroyed()) return;

    let origin = '';
    try {
      origin = new URL(wc.getURL()).origin;
    } catch {
      return;
    }
    if (origin && this.answeredOrigins.has(origin)) return;

    const result = await this.dismiss({ policy: this.deps.policy(), forceRemove: false }).catch(() => null);
    if (!result) return;

    if (result.dismissed) {
      if (origin) this.answeredOrigins.add(origin);
      this.deps.log('info', `Consent handled once (${result.intent || 'accept'} via ${result.framework || 'generic'}): ${result.message}`);
      return;
    }
    if (result.blocked) {
      // A wall we cannot answer is a human's call, not ours. Remember it so we stop re-scanning,
      // and leave the overlay exactly where it is.
      if (origin) this.answeredOrigins.add(origin);
      this.deps.log('warn', 'Consent wall present but no reject/accept control matched — left for the human (no auto-removal).');
    }
  }

  /** An explicit dismiss is allowed the last-resort removal; the background sweep is not. */
  dismiss(options: { policy?: ConsentPolicy; forceRemove?: boolean } = {}): Promise<ShieldDismissResult> {
    const wc = this.deps.activeWebContents();
    const result = this.deps.shieldBreaker().dismissConsent(wc, {
      policy: options.policy || this.deps.policy(),
      forceRemove: options.forceRemove === true,
    });
    return result.then((resolved) => {
      if (resolved.dismissed) {
        this.deps.log('info', `Shield Breaker: ${resolved.message}`);
        this.deps.telemetry({
          type: 'click',
          x: resolved.coordinates?.x,
          y: resolved.coordinates?.y,
          timestamp: Date.now(),
          details: `Shield Breaker: answered ${resolved.framework} consent wall (${resolved.intent || 'accept'})`,
        });
      }
      return resolved;
    });
  }
}
