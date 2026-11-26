/**
 * Consent-wall breaker adapter.
 *
 * The portable breaker lives in `@hyperbolictonic/hypagon-stealth`. This adapter keeps the app's
 * `WebContents` API, routes the click through the input simulator and the frame scan through the
 * browser package.
 */
import type { WebContents } from 'electron';
import { evaluateInFrames } from '../browser/frame-eval.js';
import { ShieldBreaker as PortableShieldBreaker } from '../../../packages/stealth/src/shield/breaker.ts';
import type { HumanizedInputSimulator } from '../telemetry/input-simulator.js';

export type {
  ConsentPolicy,
  ShieldDismissResult,
  ShieldFrameResult,
} from '../../../packages/stealth/src/shield/breaker.ts';

/** When to use: a consent wall during navigation — answer it the way a person would. */
export class ShieldBreaker {
  private readonly simulator: HumanizedInputSimulator;
  private readonly breaker: PortableShieldBreaker;

  constructor(simulator: HumanizedInputSimulator) {
    this.simulator = simulator;
    this.breaker = new PortableShieldBreaker({
      clickAt: (target, point) => simulator.clickAt(target, point),
      evaluateInFrames: (target, script, options) => evaluateInFrames(target, script, options),
    });
  }

  /** Answer a consent wall in the given view. */
  dismissConsent(
    wc: WebContents,
    options: { policy?: 'essential' | 'reject' | 'accept'; forceRemove?: boolean } = {},
  ) {
    return this.breaker.dismissConsent(this.simulator.targetFor(wc), options);
  }
}
