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
import type { ScreenshotStore, ScreenshotPayload } from './screenshots.js';
import { captureComposedDom } from '../harvester/dom-serializer.js';
import { ElectronTarget } from '../../../packages/electron/src/target.ts';
import type { MarksOverlay, MarkItem } from '../marks/marks-overlay.js';
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

  /** The annotated Set-of-Marks capture: badge the page, capture, then strip the badges. */
  async takeAnnotatedScreenshot(opts: { economy?: boolean; textOnly?: boolean; includeOffscreen?: boolean } = {}): Promise<{
    screenshot: ScreenshotPayload;
    marks: MarkItem[];
  }> {
    const wc = this.deps.activeWebContents();
    const economy = Boolean(opts.economy);
    const textOnly = Boolean(opts.textOnly);
    const includeOffscreen = Boolean(opts.includeOffscreen);
    this.deps.log(
      'action',
      `MCP Directive: take_annotated_screenshot(${textOnly ? 'text_only' : economy ? 'economy' : 'full'}${includeOffscreen ? ', include_offscreen' : ''})`,
    );

    // Text-only: badges are only needed to populate the mark registry; no pixels are captured.
    if (textOnly) {
      const textMarks = await this.deps.marks.scan(wc, { includeOffscreen });
      await this.deps.marksOverlay.removeMarks(wc);
      const viewport = this.deps.viewportBounds();
      const zoom = this.deps.zoomState();
      return {
        screenshot: {
          base64Image: '',
          filePath: '',
          width: viewport.width,
          height: viewport.height,
          mimeType: 'image/png',
          zoom,
          nativeWidth: viewport.width,
          nativeHeight: viewport.height,
          coordinateScale: zoom.viewport.css.width > 0 ? viewport.width / zoom.viewport.css.width : 1,
        },
        marks: textMarks,
      };
    }

    // 1. Inject visual badges into DOM
    const marks = await this.deps.marks.scan(wc, { includeOffscreen });

    // Wait a brief tick for render paint
    await new Promise((r) => setTimeout(r, 80));

    // 2. Capture annotated screenshot
    const bounds = this.deps.viewportBounds();
    const image = await this.capturePageWithRetry(wc, bounds);

    // 3. Immediately clean up marks from DOM
    await this.deps.marksOverlay.removeMarks(wc);
    const zoom = this.deps.zoomState();
    const nativeSize = image.getSize();

    // Economy mode: downscale to max 640px wide and encode as JPEG (~10-20x smaller payload)
    const ECONOMY_MAX_WIDTH = 640;
    let outImage = image;
    if (economy && image.getSize().width > ECONOMY_MAX_WIDTH) {
      outImage = image.resize({ width: ECONOMY_MAX_WIDTH, quality: 'good' });
    }

    const screenshot = this.persistScreenshot({
      image: outImage,
      jpeg: economy,
      quality: 45,
      prefix: `annotated_${economy ? 'eco_' : ''}`,
      details: (facts) => `Set-of-Marks: Tagged ${marks.length} interactive targets, saved to ${facts.filePath}`,
      zoom,
      nativeSize,
    });

    return {
      screenshot,
      marks,
    };
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

    const composed = await captureComposedDom(new ElectronTarget(wc));
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
      const composed = await captureComposedDom(new ElectronTarget(wc));
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
