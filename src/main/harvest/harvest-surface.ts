/**
 * Harvest and screenshot surface.
 *
 * Owns the grounded-markdown harvest and the viewport/annotated screenshot
 * persistence. `ScreenshotStore` keeps the file format and telemetry tail; this
 * controller supplies the active tab, marks policy and chassis state hooks.
 */
import type { NativeImage, WebContents } from 'electron';
import type { HarvestedConstruct } from '../../shared/types.js';
import type { ZoomState } from '../../shared/zoom.js';
import type { ConstructHarvester } from '../harvester/markdown.js';
import type { ScreenshotStore } from './screenshots.js';
import { captureComposedDom } from '../harvester/dom-serializer.js';
import type { MarksOverlay } from '../marks/marks-overlay.js';
import type { MarksSurface } from '../marks/marks-surface.js';
import type { TabInstance } from '../tabs/tab-manager.js';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dependencies the harvest surface needs from the active tab and chassis state. */
export interface HarvestSurfaceDeps {
  activeWebContents(): WebContents;
  viewportBounds(): Bounds;
  zoomState(): ZoomState;
  marks: MarksSurface;
  marksOverlay: MarksOverlay;
  harvester: ConstructHarvester;
  screenshotStore: ScreenshotStore;
  beginHarvest(): void;
  onConstruct(construct: HarvestedConstruct): void;
  addTokens(tokens: number): void;
  reportIdle(): void;
  emitHarvest(details: string): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  indexPage(url: string, title: string, content: string): Promise<number>;
}

/** The agent-facing harvest and screenshot surface. */
export class HarvestSurface {
  constructor(private readonly deps: HarvestSurfaceDeps) {}

  getScreenshotsDir(): string {
    return this.deps.screenshotStore.dir();
  }

  cleanupScreenshots(
    maxFiles: number = 50,
    maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
  ): { prunedCount: number; remainingCount: number } {
    return this.deps.screenshotStore.cleanup(maxFiles, maxAgeMs);
  }

  async capturePageWithRetry(
    wc: WebContents,
    bounds: Bounds,
    maxRetries: number = 3,
  ): Promise<NativeImage> {
    return this.deps.screenshotStore.captureWithRetry(wc, bounds, maxRetries);
  }

  persistScreenshot(args: Parameters<ScreenshotStore['persist']>[0]): ReturnType<ScreenshotStore['persist']> {
    return this.deps.screenshotStore.persist(args);
  }

  async takeScreenshot(opts: {
    maxWidth?: number;
    format?: 'jpeg' | 'png';
    quality?: number;
  } = {}): Promise<{
    base64Image: string;
    filePath: string;
    width: number;
    height: number;
    mimeType: string;
    zoom: ZoomState;
    nativeWidth: number;
    nativeHeight: number;
    coordinateScale: number;
  }> {
    const wc = this.deps.activeWebContents();
    this.deps.log('action', 'MCP Directive: take_screenshot()');

    const bounds = this.deps.viewportBounds();
    const rawImage = await this.capturePageWithRetry(wc, bounds);
    const zoom = this.deps.zoomState();
    const nativeSize = rawImage.getSize();

    const maxWidth = opts.maxWidth !== undefined ? opts.maxWidth : 768;
    const format = opts.format || 'jpeg';
    const quality = opts.quality !== undefined ? opts.quality : 70;

    let outImage = rawImage;
    if (maxWidth > 0 && rawImage.getSize().width > maxWidth) {
      outImage = rawImage.resize({ width: maxWidth, quality: 'good' });
    }

    return this.persistScreenshot({
      image: outImage,
      jpeg: format === 'jpeg',
      quality,
      prefix: 'screenshot_',
      details: (facts) =>
        `Captured live viewport screenshot: ${facts.width}x${facts.height}px (${facts.mimeType}, ${(facts.bytes / 1024).toFixed(1)} KB), saved to ${facts.filePath}`,
      zoom,
      nativeSize,
    });
  }

  async harvestMarkdown(opts: { includeMarks?: boolean; includeOffscreen?: boolean } = {}): Promise<HarvestedConstruct> {
    const wc = this.deps.activeWebContents();
    this.deps.beginHarvest();
    this.deps.log(
      'action',
      `MCP Directive: get_page_markdown(include_marks=${opts.includeMarks ?? true}${opts.includeOffscreen ? ', include_offscreen' : ''})`,
    );

    // Ensure interactive elements have data-mark-id stamps for grounded markdown
    if (opts.includeMarks !== false) {
      await this.deps.marks.scan(wc, { includeOffscreen: Boolean(opts.includeOffscreen) });
      await this.deps.marksOverlay.removeMarks(wc); // Strips visual badges, keeps data-mark-id
    }

    const composed = await captureComposedDom(wc);
    const rawHtml = composed.html;
    const url = wc.getURL();
    const title = wc.getTitle();

    const construct = this.deps.harvester.harvest(rawHtml, url, title, { shadowRoots: composed.shadowRoots });
    this.deps.onConstruct(construct);
    this.deps.addTokens(construct.estimatedTokens);
    this.deps.reportIdle();

    this.deps.emitHarvest(`Construct extracted: ${construct.estimatedTokens} tokens (${construct.markdownLength} bytes)`);

    this.deps.log('info', `Construct harvested: ${construct.title} (~${construct.estimatedTokens} tokens)`);
    void this.deps.indexPage(url, construct.title, construct.content);
    return construct;
  }

  /** Index a background tab after navigation; failures are non-fatal. */
  async indexTabQuietly(tab: TabInstance): Promise<void> {
    try {
      const url = tab.url;
      const title = tab.title;
      if (!url || url === 'about:blank' || url.startsWith('mark-eleven:') || url.startsWith('file:')) return;

      const wc = tab.view.webContents;
      const composed = await captureComposedDom(wc);
      const rawHtml = composed.html;
      const construct = this.deps.harvester.harvest(rawHtml, url, title, { shadowRoots: composed.shadowRoots });
      const indexedCount = await this.deps.indexPage(url, construct.title, construct.content);
      if (indexedCount > 0) {
        this.deps.log('info', `Cortex indexed: ${construct.title} (${indexedCount} semantic chunks)`);
      }
    } catch {
      // Background indexing failure is non-fatal
    }
  }
}
