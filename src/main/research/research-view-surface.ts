/**
 * Research view surface.
 *
 * Owns the shared off-screen research view and the citation pipeline that reads
 * through it: content-negotiated text navigation, detached scripted loads, the
 * anchor relocate/revalidate operations and the human hand-off. The chassis
 * supplies the window, HIL manager, settings, viewport facts and the log; the
 * view itself serializes every read.
 */
import type { BrowserWindow, WebContents } from 'electron';
import type { HilManager } from '../hil/hil-manager.js';
import { RenderedSnapshotEngine } from '../snapshots/rendered-snapshot.js';
import type { CitationRelocation } from './anchors.js';
import {
  CitationController,
  type RevalidationSummary,
} from './citation-controller.js';
import {
  DetachedViewController,
  type DetachedLoadOptions,
  type DetachedLoadResult,
} from './detached-view.js';
import type { ResearchSettings } from './settings.js';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dependencies the research view needs from the window and the HIL manager. */
export interface ResearchViewSurfaceDeps {
  /** The host fingerprint's UA, set once on the detached view. */
  userAgent: string;
  /** Wake the research view through CDP before the first read. */
  activate(wc: WebContents): Promise<void>;
  window(): BrowserWindow | null;
  hilManager(): HilManager;
  researchSettings(): ResearchSettings;
  viewportBounds(): Promise<Bounds>;
  reassertViewport(): void;
  activeWebContents(): WebContents;
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** The detached research view and the citation/hand-off pipeline over it. */
export class ResearchViewSurface {
  /** The shared off-screen view; crawl/search may read it directly. */
  readonly detached: DetachedViewController;
  /** Citation relocation, revalidation and the human hand-off. */
  readonly citations: CitationController;

  constructor(deps: ResearchViewSurfaceDeps) {
    this.detached = new DetachedViewController({
      userAgent: deps.userAgent,
      activate: deps.activate,
    });
    this.citations = new CitationController({
      window: deps.window,
      detachedView: this.detached,
      hilManager: deps.hilManager,
      researchSettings: deps.researchSettings,
      viewportBounds: deps.viewportBounds,
      reassertViewport: deps.reassertViewport,
      activeWebContents: deps.activeWebContents,
      log: deps.log,
    });
  }

  /**
   * Loads a URL in the detached view (real Chromium, host fingerprint) and returns the result of
   * `script`. Used for Markdown/Text alternates and for `search_web` SERPs — without hijacking the
   * active tab.
   */
  load<T = any>(
    url: string,
    script: string,
    opts: DetachedLoadOptions = {},
  ): Promise<DetachedLoadResult<T>> {
    return this.detached.load<T>(url, script, opts);
  }

  /** The content-negotiated navigation path the LLM surface reads through. */
  navigateForText(url: string): Promise<{ body: string | null; contentType: string | null; status: number }> {
    return this.detached.navigateForText(url);
  }

  /** Revalidate a stored citation anchor against the page's current markup. */
  relocateCitation(opts: { url: string; fingerprint: unknown; threshold?: number }): Promise<CitationRelocation> {
    return this.citations.relocateCitation(opts);
  }

  /**
   * Renders a URL in the shared detached view and distils it to Markdown — the composite
   * `read_url` fallback. Deliberately not crawlRenderPage: read_url is a single-page read.
   */
  async renderMarkdown(url: string): Promise<{ markdown: string; title: string; status: number; contentType: string | null }> {
    const r = await this.detached.load<{ title: string }>(
      url,
      '(() => ({ title: document.title || "" }))()',
      {
        timeoutMs: 25000,
        after: async (wc) => (await RenderedSnapshotEngine.capture(wc, { format: 'markdown', waitUntilIdleMs: 400 })).content,
      },
    );
    return { markdown: r.after || '', title: r.result?.title || url, status: r.status, contentType: r.contentType };
  }

  /** Revalidate every stored anchor for one URL (or the most recent URLs). */
  revalidateStored(opts: { url?: string; maxUrls?: number } = {}): Promise<RevalidationSummary> {
    return this.citations.revalidateStored(opts);
  }
}
