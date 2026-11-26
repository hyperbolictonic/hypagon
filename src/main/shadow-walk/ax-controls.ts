/**
 * Sealed shadow-root discovery adapter.
 *
 * The portfolio policy lives in the app (Shadow Walk settings); the scan and measurement live in
 * `@hyperbolictonic/hypagon-stealth`. This adapter keeps the app's `WebContents` API and feeds the
 * current settings into the portable entry point.
 */
import type { WebContents } from 'electron';
import {
  findSealedControls as findSealedControlsOnTarget,
  type SealedFindOptions,
  type SealedFindResult,
} from '../../../packages/stealth/src/shadow/ax-controls.ts';
import { electronTargetFor } from '../browser/electron-targets.js';
import { loadShadowWalkSettings } from './settings.js';

export type { SealedControl, SealedFindOptions, SealedFindResult, SealedRect } from '../../../packages/stealth/src/shadow/ax-controls.ts';
export { SealedRateLimitError } from '../../../packages/stealth/src/shadow/ax-controls.ts';

/** When to use: `find(sealed:true)` on the active view. */
export function findSealedControls(
  wc: WebContents,
  options: SealedFindOptions = {},
): Promise<SealedFindResult> {
  const shadow = loadShadowWalkSettings().shadow;
  return findSealedControlsOnTarget(electronTargetFor(wc), options, {
    componentSurface: shadow.componentSurface,
    cdpStyleMatch: shadow.cdpStyleMatch,
  });
}
