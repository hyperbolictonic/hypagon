/**
 * The warm-view pool: the map, the size cap, the TTL sweep and the disposal.
 *
 * Why a module: `has`, `consume`, the capacity check and the cleaner all reason
 * about the same map and the same three rules — normalized lookup, oldest-first
 * eviction, drop the native view on the way out. The engine decides *when* to
 * warm; the pool decides what stays warm.
 */
import type { WebContentsView } from 'electron';
import type { PrerenderItem } from './types.js';
import { normalizePrerenderUrl } from './url.js';

/** Drop the native view behind a pooled item; a destroyed one is not an error. */
function dispose(view: WebContentsView): void {
  try {
    (view.webContents as any).destroy?.();
  } catch {
    // The window can be mid-teardown.
  }
}

/** When to use: `PrerenderEngine` — one pool per process. */
export class PrerenderPool {
  private readonly items = new Map<string, PrerenderItem>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  /** When to use: the engine constructor; the defaults are 3 views for 3 minutes. */
  constructor(maxSize = 3, ttlMs = 3 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  size(): number {
    return this.items.size;
  }

  /** Whether a view is warm for this URL, query order ignored. */
  has(url: string): boolean {
    return this.findKey(url) !== null;
  }

  /** Take the warm view for this URL out of the pool, or undefined. */
  take(url: string): WebContentsView | undefined {
    const key = this.findKey(url);
    if (key === null) return undefined;
    const item = this.items.get(key);
    this.items.delete(key);
    return item?.view;
  }

  add(item: PrerenderItem): void {
    this.items.set(item.url, item);
  }

  /** Evict the oldest entry when the pool is at capacity. */
  makeRoom(): void {
    if (this.items.size < this.maxSize) return;
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, item] of this.items.entries()) {
      if (item.createdAt < oldestAt) {
        oldestAt = item.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey === null) return;
    const oldest = this.items.get(oldestKey);
    if (oldest) dispose(oldest.view);
    this.items.delete(oldestKey);
  }

  /** Drop every view past its TTL. */
  sweep(): void {
    const now = Date.now();
    for (const [key, item] of this.items.entries()) {
      if (now - item.createdAt <= this.ttlMs) continue;
      dispose(item.view);
      this.items.delete(key);
    }
  }

  /** Drop every view (engine teardown). */
  destroy(): void {
    for (const item of this.items.values()) dispose(item.view);
    this.items.clear();
  }

  private findKey(url: string): string | null {
    const normalized = normalizePrerenderUrl(url);
    for (const key of this.items.keys()) {
      if (normalizePrerenderUrl(key) === normalized) return key;
    }
    return null;
  }
}
