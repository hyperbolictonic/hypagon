/**
 * Sealed shadow-root discovery.
 *
 * A closed shadow root cannot be read from page JavaScript, by design. It is still in the
 * renderer's accessibility tree, and the DOM agent can describe it when asked to pierce shadow
 * roots — so this module answers one question: *which interactive controls live under a closed
 * root, and where are they on screen?*
 *
 * Deliberate limits:
 *   - It runs only when `find(sealed:true)` asks. Nothing here is called on navigation or idle.
 *   - One AX tree + one pierce per frame set, cached by document revision and held for a few
 *     seconds. A repeat call re-measures only the matched nodes.
 *   - Results carry coordinates and roles, never a mark id and never an input value.
 *   - Full scans are rate-limited; a loop cannot turn the browser into a scanner.
 *
 * Why this file is small: `sealed-scan.ts` owns the identity scan (AX tree, pierce, OOPIF
 * sessions, component surface, style provenance), `sealed-measure.ts` owns the box-model pass,
 * `sealed-gate.ts` owns the cache and the rate limit, and `sealed-cdp.ts` owns the session
 * attach/detach both phases share. This module is the policy: validate, reuse or scan, filter,
 * measure, report.
 */
import type { WebContents } from 'electron';
import { listFrames } from '../browser/frames.js';
import { SealedScanGate } from './sealed-gate.js';
import { measureSealedControls } from './sealed-measure.js';
import { SealedScanner } from './sealed-scan.js';
import { loadShadowWalkSettings } from './settings.js';
import type { SealedFindOptions, SealedFindResult, SealedIdentity } from './sealed-types.js';

export type { SealedControl, SealedFindOptions, SealedFindResult, SealedRect } from './sealed-types.js';
export { SealedRateLimitError } from './sealed-gate.js';

const MAX_LIMIT = 40;
const MAX_FRAMES = 8;

function emptyResult(notes: string[] = []): SealedFindResult {
  return { controls: [], total: 0, cached: false, frames: 0, scannedAt: Date.now(), notes };
}

function lower(value: any): string {
  return String(value ?? '').toLowerCase();
}

/** The agent-facing filters, applied to cached identities before any measuring. */
function filterIdentities(identities: SealedIdentity[], options: SealedFindOptions): SealedIdentity[] {
  const want = lower(options.name || options.contains || '');
  const re = options.regex ? new RegExp(options.regex, options.flags || 'i') : null;
  return identities.filter((identity) => {
    if (options.role && identity.role !== lower(options.role)) return false;
    if (options.tag && identity.nodeName !== String(options.tag).toUpperCase()) return false;
    if (want && !lower(identity.name).includes(want)) return false;
    if (re && !re.test(identity.name)) return false;
    return true;
  });
}

/**
 * Find interactive controls inside closed shadow roots.
 *
 * Never throws for an ordinary page (missing debugger, frame not attributable); rate limiting is the
 * one deliberate refusal, so an agent loop gets a retry hint instead of silently scanning forever.
 */
export async function findSealedControls(
  wc: WebContents,
  options: SealedFindOptions = {},
): Promise<SealedFindResult> {
  if (!wc || wc.isDestroyed()) return emptyResult(['No active tab.']);
  if (!wc.debugger?.isAttached()) return emptyResult(['The CDP debugger is not attached to the active tab.']);
  if (options.selector) {
    const err: any = new Error(
      'Selector filtering is not available for sealed controls; use name, role, tag or contains.',
    );
    err.code = 'NOT_SUPPORTED';
    throw err;
  }

  const frames = await listFrames(wc, { maxFrames: MAX_FRAMES });
  if (!frames.length) return emptyResult(['No frame tree available for the active tab.']);
  const main = frames.find((f) => f.depth === 0);
  if (!main) return emptyResult(['The frame list has no main frame.']);

  const settings = loadShadowWalkSettings();
  const componentsEnabled = settings.shadow.componentSurface;
  const styleMatch = settings.shadow.cdpStyleMatch;
  const key = [
    main.loaderId || main.url,
    frames.map((f) => `${f.frameId}:${f.depth}:${f.url}`).join(','),
    options.revision ?? 0,
    componentsEnabled ? 'components' : 'plain',
    styleMatch ? 'styles' : 'best-effort',
  ].join('|');

  const gate = new SealedScanGate();
  const cached = options.refresh ? null : gate.cached(wc, key);

  let identities: SealedIdentity[];
  let notes: string[];
  if (cached) {
    identities = cached.identities;
    notes = cached.notes;
  } else {
    gate.admit(wc);
    const scan = await new SealedScanner(wc, frames, { componentsEnabled, styleMatch }).scan();
    identities = scan.identities;
    notes = scan.notes;
    gate.store(wc, { key, at: Date.now(), identities, notes, frames: frames.length });
  }

  const filtered = filterIdentities(identities, options);
  const measured = await measureSealedControls(wc, frames, filtered, options);

  return {
    controls: measured.controls,
    total: filtered.length,
    cached: cached !== null,
    frames: frames.length,
    scannedAt: Date.now(),
    // Concatenated, not pushed: the cached note list is shared with the next call.
    notes: [...notes, ...measured.notes],
  };
}
