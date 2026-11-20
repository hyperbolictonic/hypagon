/**
 * The screenshot surface: the shots directory, cleanup, and a plain viewport capture.
 *
 * The retrying capture helper stays on the chassis (four other call sites use it) and is injected.
 */
import type { WebContents } from 'electron';
import type { ZoomState } from '../../shared/zoom.js';
import { pruneScreenshots, saveCapture, screenshotsDir } from '../snapshots/screenshot-store.js';

/** When to use: constructing the screenshot surface from the chassis' own services. */
export interface ScreenshotSurfaceDeps {
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  webContents: () => WebContents;
  telemetry: (event: any) => void;
  state: { agentStatus: string; activeAction?: string };
  broadcastState: () => void;
  viewportBounds: () => { x: number; y: number; width: number; height: number };
  capturePageWithRetry: (wc: WebContents, bounds: any) => Promise<any>;
  zoomState: () => any;
}

/** When to use: `chassis.screenshots` — capture and housekeeping. */
export class ScreenshotSurface {
  constructor(private readonly deps: ScreenshotSurfaceDeps) {}

  public getScreenshotsDir(): string {
    return screenshotsDir();
  }

  public cleanupScreenshots(maxFiles: number = 50, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): { prunedCount: number; remainingCount: number } {
    const result = pruneScreenshots(maxFiles, maxAgeMs);
    if (result.prunedCount > 0) {
      this.deps.log('info', `Disk Maintenance: Pruned ${result.prunedCount} old screenshots from data/screenshots/ (kept ${result.remainingCount})`);
    }
    return result;
  }


  public async takeScreenshot(opts: {
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
    const wc = this.deps.webContents();
    this.deps.log('action', 'MCP Directive: take_screenshot()');

    const bounds = this.deps.viewportBounds();
    const rawImage = await this.deps.capturePageWithRetry(wc, bounds);
    const zoom = this.deps.zoomState();
    const nativeSize = rawImage.getSize();

    const maxWidth = opts.maxWidth !== undefined ? opts.maxWidth : 768;
    const format = opts.format || 'jpeg';
    const quality = opts.quality !== undefined ? opts.quality : 70;

    let outImage = rawImage;
    if (maxWidth > 0 && rawImage.getSize().width > maxWidth) {
      outImage = rawImage.resize({ width: maxWidth, quality: 'good' });
    }

    const size = outImage.getSize();
    const isJpeg = format === 'jpeg';
    const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
    const buffer = isJpeg ? outImage.toJPEG(quality) : outImage.toPNG();
    const base64Image = `data:${mimeType};base64,${buffer.toString('base64')}`;

    // Save image to disk & run retention cleanup
    const filePath = saveCapture(buffer, `screenshot_${Date.now()}.${isJpeg ? 'jpg' : 'png'}`);

    this.deps.telemetry({
      type: 'harvest',
      timestamp: Date.now(),
      details: `Captured live viewport screenshot: ${size.width}x${size.height}px (${mimeType}, ${(buffer.length / 1024).toFixed(1)} KB), saved to ${filePath}`,
    });

    return {
      base64Image,
      filePath,
      width: size.width,
      height: size.height,
      mimeType,
      zoom,
      nativeWidth: nativeSize.width,
      nativeHeight: nativeSize.height,
      coordinateScale: zoom.viewport.css.width > 0 ? size.width / zoom.viewport.css.width : 1,
    };
  }
}
