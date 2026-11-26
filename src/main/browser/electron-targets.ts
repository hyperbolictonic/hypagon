/**
 * One `ElectronTarget` per view.
 *
 * Input, sealed tokens and frame operations all key state by the target object, so a
 * fresh adapter per call would lose the per-target viewport scale and the token
 * registry. This cache is the single place that maps a `WebContents` to its adapter.
 */
import type { WebContents } from 'electron';
import { ElectronTarget } from '../../../packages/electron/src/target.ts';

const targets = new WeakMap<WebContents, ElectronTarget>();

/** When to use: any app surface that needs the SDK target for a view. */
export function electronTargetFor(wc: WebContents): ElectronTarget {
  let target = targets.get(wc);
  if (!target) {
    target = new ElectronTarget(wc);
    targets.set(wc, target);
  }
  return target;
}
