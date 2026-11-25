/**
 * The two policies a sealed scan obeys: how often a tab may scan, and how long
 * its identity list stays valid.
 *
 * Why a module: a full scan is the only expensive part of the path, and both
 * rules are enforced per `WebContents` and outlive a single call. Keeping them
 * here means the scanner has no timer or counter of its own to get wrong.
 */
import type { WebContents } from 'electron';
import { bump } from '../metrics.js';
import type { SealedCacheEntry } from './sealed-types.js';

const CACHE_TTL_MS = 5000;
const RATE_WINDOW_MS = 60000;
const RATE_LIMIT = 6;

/** When to use: caught by the tool layer to return a retry hint instead of a failure. */
export class SealedRateLimitError extends Error {
  public code = 'SEALED_RATE_LIMITED';
  public retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Sealed discovery is rate-limited (${RATE_LIMIT} scans/minute per tab); retry in ${Math.ceil(retryAfterMs / 1000)}s.`,
    );
    this.name = 'SealedRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

const caches = new WeakMap<WebContents, SealedCacheEntry>();
const rates = new WeakMap<WebContents, number[]>();

/** When to use: `findSealedControls` — one gate per call, shared state per tab. */
export class SealedScanGate {
  /** The cached identity list for this document, or null when a scan is needed. */
  cached(wc: WebContents, key: string): SealedCacheEntry | null {
    const cache = caches.get(wc);
    if (!cache || cache.key !== key || Date.now() - cache.at >= CACHE_TTL_MS) return null;
    bump('sealed.cacheHit');
    return cache;
  }

  /** Admit one full scan, or throw the retry hint when the window is exhausted. */
  admit(wc: WebContents): void {
    const now = Date.now();
    const recent = (rates.get(wc) || []).filter((at) => now - at < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      throw new SealedRateLimitError(RATE_WINDOW_MS - (now - recent[0]));
    }
    recent.push(now);
    rates.set(wc, recent);
  }

  /** Remember a scan's identity list for the next call on the same document. */
  store(wc: WebContents, entry: SealedCacheEntry): void {
    caches.set(wc, entry);
  }
}
