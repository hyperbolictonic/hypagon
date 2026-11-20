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
 * The identity scan lives in `sealed-scan.ts` and the geometry pass in `sealed-measure.ts`;
 * this module owns the cache, the rate limit and the refusal contract.
 */
import type { WebContents } from 'electron';
import { bump } from '../metrics.js';
import { listFrames } from '../browser/frames.js';
import { loadShadowWalkSettings } from './settings.js';
import { scanSealedIdentities } from './sealed-scan.js';
import { measureSealedControls } from './sealed-measure.js';
import { SealedRateLimitError } from './sealed-types.js';
import type { SealedFindOptions, SealedFindResult, SealedIdentity } from './sealed-types.js';

export { SealedRateLimitError } from './sealed-types.js';
export type {
  SealedControl,
  SealedFindOptions,
  SealedFindResult,
  SealedRect,
} from './sealed-types.js';

const CACHE_TTL_MS = 5000;
const RATE_WINDOW_MS = 60000;
const RATE_LIMIT = 6;
const MAX_FRAMES = 8;

interface CacheEntry {
  key: string;
  at: number;
  identities: SealedIdentity[];
  notes: string[];
  frames: number;
}

const caches = new WeakMap<WebContents, CacheEntry>();
const rates = new WeakMap<WebContents, number[]>();

/**
 * Find interactive controls inside closed shadow roots.
 *
 * Never throws for an ordinary page (missing debugger, frame not attributable); rate limiting is the
 * one deliberate refusal, so an agent loop gets a retry hint instead of silently scanning forever.
 */
export async function findSealedControls(
  wc: WebContents,
  options: SealedFindOptions = {}
): Promise<SealedFindResult> {
  const empty = (notes: string[] = []): SealedFindResult => ({
    controls: [],
    total: 0,
    cached: false,
    frames: 0,
    scannedAt: Date.now(),
    notes,
  });

  if (!wc || wc.isDestroyed()) return empty(['No active tab.']);
  if (!wc.debugger?.isAttached()) return empty(['The CDP debugger is not attached to the active tab.']);
  if (options.selector) {
    const err: any = new Error(
      'Selector filtering is not available for sealed controls; use name, role, tag or contains.'
    );
    err.code = 'NOT_SUPPORTED';
    throw err;
  }

  const frames = await listFrames(wc, { maxFrames: MAX_FRAMES });
  if (!frames.length) return empty(['No frame tree available for the active tab.']);

  const main = frames.find((f) => f.depth === 0);
  if (!main) return empty(['The frame list has no main frame.']);

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

  const cache = caches.get(wc);
  let identities: SealedIdentity[];
  let notes: string[] = [];
  let cached = false;

  if (!options.refresh && cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
    identities = cache.identities;
    notes = cache.notes;
    cached = true;
    bump('sealed.cacheHit');
  } else {
    const now = Date.now();
    const recent = (rates.get(wc) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      throw new SealedRateLimitError(RATE_WINDOW_MS - (now - recent[0]));
    }
    recent.push(now);
    rates.set(wc, recent);

    identities = await scanSealedIdentities({ wc, frames, componentsEnabled, styleMatch, notes });
    caches.set(wc, { key, at: Date.now(), identities, notes, frames: frames.length });
  }

  const measured = await measureSealedControls({ wc, frames, identities, options, notes });

  return {
    controls: measured.controls,
    total: measured.total,
    cached,
    frames: frames.length,
    scannedAt: Date.now(),
    notes,
  };
}
