/**
 * The two policies a sealed scan obeys: how often a tab may scan, and how long
 * its identity list stays valid.
 *
 * Why a module: a full scan is the only expensive part of the path, and both
 * rules are enforced per `WebContents` and outlive a single call. Keeping them
 * here means the scanner has no timer or counter of its own to get wrong.
 */
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';
import type { SealedCacheEntry } from './sealed-types.ts';
import { sealedMetric } from './metrics.ts';

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

const caches = new WeakMap<BrowserTarget, SealedCacheEntry>();
const rates = new WeakMap<BrowserTarget, number[]>();

/** When to use: `findSealedControls` — one gate per call, shared state per target. */
export class SealedScanGate {
  /** The cached identity list for this document, or null when a scan is needed. */
  cached(target: BrowserTarget, key: string): SealedCacheEntry | null {
    const cache = caches.get(target);
    if (!cache || cache.key !== key || Date.now() - cache.at >= CACHE_TTL_MS) return null;
    sealedMetric('cacheHit');
    return cache;
  }

  /** Admit one full scan, or throw the retry hint when the window is exhausted. */
  admit(target: BrowserTarget): void {
    const now = Date.now();
    const recent = (rates.get(target) || []).filter((at) => now - at < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) {
      throw new SealedRateLimitError(RATE_WINDOW_MS - (now - recent[0]));
    }
    recent.push(now);
    rates.set(target, recent);
  }

  /** Remember a scan's identity list for the next call on the same document. */
  store(target: BrowserTarget, entry: SealedCacheEntry): void {
    caches.set(target, entry);
  }
}
