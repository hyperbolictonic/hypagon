/**
 * The speculative prerender pool: warm background views for the links an agent
 * is about to open, so elevation is 0 ms instead of a full navigation.
 *
 * Why this file is small: the view creation and stealth headers are
 * `view-factory.ts`, the pool with its eviction and TTL is `pool.ts`, the
 * candidate-link heuristic is `candidate-links.ts`, the URL key is `url.ts`, and
 * the Cortex pre-harvest is `harvest.ts`. This class decides what to warm and
 * answers the navigation surface's two questions (is it warm, take it).
 */
import type { WebContents, WebContentsView } from 'electron';
import type { CortexDB } from '../cortex/cortex-db.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import { extractCandidateLinks } from './candidate-links.js';
import { harvestPrerenderedItem } from './harvest.js';
import { PrerenderPool } from './pool.js';
import type { PrerenderOptions } from './types.js';
import { spawnPrerenderView } from './view-factory.js';

export type { PrerenderItem, PrerenderOptions } from './types.js';

/** How many warm views the pool keeps; also the ceiling for one tool call. */
const MAX_POOL_SIZE = 3;
/** A warm view is dropped after three minutes: the page has moved on by then. */
const POOL_TTL_MS = 3 * 60 * 1000;

/** When to use: the chassis — own the warm views and the background harvest. */
export class PrerenderEngine {
  private readonly pool = new PrerenderPool(MAX_POOL_SIZE, POOL_TTL_MS);
  private readonly hostProfile: HostBrowserProfile;
  private readonly cortex: CortexDB;
  private readonly onLog?: (level: 'info' | 'warn' | 'action', message: string) => void;

  constructor(
    hostProfile: HostBrowserProfile,
    cortex: CortexDB,
    onLog?: (level: 'info' | 'warn' | 'action', message: string) => void,
  ) {
    this.hostProfile = hostProfile;
    this.cortex = cortex;
    this.onLog = onLog;

    // Periodic sweep for expired prerendered views
    setInterval(() => this.pool.sweep(), 30000);
  }

  /**
   * Pre-renders candidate URLs in the background with full hydration and stealth headers.
   */
  public async prerender(
    activeWc: WebContents,
    options: PrerenderOptions = {},
  ): Promise<{ prerendered: string[]; count: number }> {
    const maxPages = Math.min(Math.max(1, options.maxPages || MAX_POOL_SIZE), MAX_POOL_SIZE);
    const harvestToCortex = options.harvestToCortex !== false;

    // 1. Resolve URLs to prerender
    let candidateUrls: string[] = [];
    if (Array.isArray(options.urls) && options.urls.length > 0) {
      candidateUrls = options.urls;
    } else {
      candidateUrls = await extractCandidateLinks(activeWc, options.selector, maxPages);
    }

    // Clean & normalize URLs
    candidateUrls = Array.from(new Set(candidateUrls))
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, maxPages);

    if (candidateUrls.length === 0) {
      return { prerendered: [], count: 0 };
    }

    const completed: string[] = [];

    for (const targetUrl of candidateUrls) {
      // Skip if already warm in pool
      if (this.pool.has(targetUrl)) {
        completed.push(targetUrl);
        continue;
      }

      // Evict oldest if pool is full
      this.pool.makeRoom();

      try {
        const item = await spawnPrerenderView(this.hostProfile, targetUrl, options.waitUntilIdleMs || 600);
        this.pool.add(item);
        completed.push(targetUrl);

        // Pre-harvest to LanceDB Cortex in background
        if (harvestToCortex && !item.harvested) {
          void harvestPrerenderedItem(item, this.cortex, this.onLog);
        }
      } catch (err: any) {
        this.onLog?.('warn', `Failed to prerender link "${targetUrl}": ${err.message}`);
      }
    }

    this.onLog?.(
      'action',
      `Prerendered ${completed.length} candidate URLs into background pool: ${completed.map((u) => u.slice(0, 50)).join(', ')}`,
    );

    return {
      prerendered: completed,
      count: completed.length,
    };
  }

  /**
   * Checks if an exact or normalized URL has an active pre-rendered view.
   */
  public has(url: string): boolean {
    return this.pool.has(url);
  }

  /**
   * Consumes and returns a pre-rendered view for instant (0ms) tab elevation.
   */
  public consume(url: string): WebContentsView | undefined {
    const view = this.pool.take(url);
    if (view) this.onLog?.('info', `Instant 0ms swap: Elevated prerendered view for "${url}"`);
    return view;
  }

  public destroy(): void {
    this.pool.destroy();
  }
}
