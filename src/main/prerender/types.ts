/**
 * The prerender pool's item and option shapes.
 *
 * Why a module: the engine, the view factory and the candidate-link extractor
 * all describe the same pooled item. Keeping the type in the engine would make
 * the factory import the class that constructs it.
 */
import type { WebContentsView } from 'electron';

/** When to use: one warm background view in the prerender pool. */
export interface PrerenderItem {
  url: string;
  view: WebContentsView;
  createdAt: number;
  ready: boolean;
  title: string;
  harvested: boolean;
}

/** When to use: the `prerender_links` tool call. */
export interface PrerenderOptions {
  urls?: string[];
  selector?: string;
  maxPages?: number;
  harvestToCortex?: boolean;
  waitUntilIdleMs?: number;
}
