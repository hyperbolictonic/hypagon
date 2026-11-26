/**
 * The anchor store and the warm-origin set: what a citation points at, and which
 * origins a human already cleared in the real browser this session.
 *
 * Why a module: both answer "how much do we already know about this page", both are
 * populated by the same capture path, and neither needs the hand-off.
 */
import path from 'node:path';
import { anchorHighlights, relocateCitations as relocateMany } from './anchors.ts';
import { AnchorStore } from './anchor-store.ts';
import type { CitationAnchor } from './anchors.ts';

/** When to use: `CitationAnchors` — the narrow fetch it revalidates against. */
export interface CitationHtmlFetcher {
  fetch(url: string): Promise<{ html: string; error?: string }>;
}

/** The outcome of revalidating stored anchors across URLs. */
export interface RevalidationSummary {
  urls: number;
  checked: number;
  found: number;
  missing: number;
  results: Array<{ url: string; checked: number; found: number; error?: string }>;
}

/** When to use: `CitationController` — the anchors and the fetch it revalidates with. */
export class CitationAnchors {
  private readonly fetcher: CitationHtmlFetcher;
  private readonly storeFile?: string;
  private store: AnchorStore | null = null;
  /** Origins whose consent wall has already been answered (or deliberately left) this session. */
  private readonly warm = new Set<string>();

  constructor(fetcher: CitationHtmlFetcher, options: { storeFile?: string } = {}) {
    this.fetcher = fetcher;
    this.storeFile = options.storeFile;
  }

  private get anchorStore(): AnchorStore {
    if (!this.store) {
      this.store = new AnchorStore(this.storeFile ?? path.join(process.cwd(), 'research-anchors.json'));
    }
    return this.store;
  }

  /** True when a human authenticated this origin in the real browser this session. */
  originIsWarm(url: string): boolean {
    try {
      return this.warm.has(new URL(url).origin);
    } catch {
      return false;
    }
  }

  /** Record that a human cleared this origin in the real browser. */
  warmOrigin(url: string): void {
    try {
      this.warm.add(new URL(url).origin);
    } catch {
      // A malformed URL has no origin to remember.
    }
  }

  /** Fingerprint the blocks behind matching highlights and store them for revalidation. */
  async fromHtml(url: string, html: string | undefined | null, anchorsFor: string): Promise<CitationAnchor[] | undefined> {
    if (!html) return undefined;
    const anchors = await anchorHighlights(html, anchorsFor);
    if (anchors.length) this.anchorStore.upsert(url, anchors);
    return anchors;
  }

  /** Revalidate every stored anchor for one URL (or the most recent URLs). */
  async revalidate(opts: { url?: string; maxUrls?: number } = {}): Promise<RevalidationSummary> {
    const urls = opts.url
      ? [opts.url]
      : // Each URL is fetched sequentially with a 25s limit. Keep a single call bounded so an agent
        // cannot pin the bridge for hours by asking for every stored URL at once.
        this.anchorStore.urls().slice(0, Math.min(25, Math.max(1, Number(opts.maxUrls) || 5)));

    let checked = 0;
    let found = 0;
    const results: Array<{ url: string; checked: number; found: number; error?: string }> = [];

    for (const url of urls) {
      const records = this.anchorStore.list(url);
      if (records.length === 0) continue;

      const fetched = await this.fetcher.fetch(url);
      if (fetched.error) {
        results.push({ url, checked: 0, found: 0, error: fetched.error });
        continue;
      }

      const relocations = await relocateMany(
        fetched.html,
        records.map((record) => record.fingerprint),
        40,
      );
      this.anchorStore.applyChecks(url, relocations);

      const urlFound = relocations.filter((result) => result.found).length;
      checked += relocations.length;
      found += urlFound;
      results.push({ url, checked: relocations.length, found: urlFound });
    }

    return { urls: results.length, checked, found, missing: checked - found, results };
  }
}
