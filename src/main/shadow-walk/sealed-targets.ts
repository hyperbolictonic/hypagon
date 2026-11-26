/**
 * Short-lived sealed targets adapter.
 *
 * Tokens are keyed by the SDK target, so this adapter maps the app's `WebContents` to the shared
 * `ElectronTarget` cache before delegating.
 */
import type { WebContents } from 'electron';
import {
  clearSealedTokens as clearTokens,
  issueSealedToken as issueToken,
  resolveSealedToken as resolveToken,
} from '../../../packages/stealth/src/shadow/sealed-targets.ts';
import { electronTargetFor } from '../browser/electron-targets.js';

/** When to use: a fresh sealed scan or a navigation — invalidate the tab's sealed tokens. */
export function clearSealedTokens(wc: WebContents): void {
  clearTokens(electronTargetFor(wc));
}

/** When to use: a sealed result — mint an opaque token that can scroll and measure the node later. */
export function issueSealedToken(wc: WebContents, backendNodeId: number, frameId: string): string {
  return issueToken(electronTargetFor(wc), backendNodeId, frameId);
}

/** When to use: `act` with a sealed token — resolve it to a live top-level centre. */
export function resolveSealedToken(
  wc: WebContents,
  token: string,
): Promise<{ center: { x: number; y: number }; rect: { x: number; y: number; width: number; height: number }; frameId: string } | null> {
  return resolveToken(electronTargetFor(wc), token);
}
