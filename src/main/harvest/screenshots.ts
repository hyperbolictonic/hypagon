/**
 * Screenshot persistence: the data/screenshots directory, retention, the
 * compositor-retry capture and the encode/save/telemetry tail.
 *
 * Why a module: three capture paths (live viewport, annotated marks, and the
 * decision model's JPEG probe) each needed the directory, the retention run and
 * the retry logic; keeping them in the chassis meant the retention policy and
 * the retry rules were one edit away from drifting apart.
 */
import fs from 'node:fs';
import path from 'node:path';
import { withPartHighlight } from '../shadow-walk/part-highlight.js';
import type { TelemetryEvent } from '../../shared/types.js';
import type { ZoomState } from '../../shared/zoom.js';
import { dataPath } from '../data-paths.js';

/** When to use: building the chassis — log and telemetry come from the chassis. */
export interface ScreenshotStoreDeps {
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  telemetry: (event: TelemetryEvent) => void;
}

/** The screenshot payload both capture paths (live viewport and annotated marks) return. */
export interface ScreenshotPayload {
  base64Image: string;
  filePath: string;
  width: number;
  height: number;
  mimeType: string;
  zoom: ZoomState;
  nativeWidth: number;
  nativeHeight: number;
  coordinateScale: number;
}

/** When to use: the chassis — own screenshot persistence: directory, retention, capture retry and the encode/save tail. */
export class ScreenshotStore {
  private readonly deps: ScreenshotStoreDeps;

  constructor(deps: ScreenshotStoreDeps) {
    this.deps = deps;
  }

  dir(): string {
    const dir = dataPath('screenshots');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  cleanup(maxFiles: number = 50, maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): { prunedCount: number; remainingCount: number } {
    try {
      const dir = this.dir();
      const files = fs.readdirSync(dir);
      const now = Date.now();
      const screenshotFiles: { file: string; fullPath: string; mtimeMs: number; size: number }[] = [];

      for (const file of files) {
        if (!file.toLowerCase().endsWith('.png')) continue;
        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          screenshotFiles.push({ file, fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
        } catch {
          // ignore stat errors
        }
      }

      // Sort oldest first
      screenshotFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

      let prunedCount = 0;
      const keepFiles: typeof screenshotFiles = [];

      for (const item of screenshotFiles) {
        const isExpired = now - item.mtimeMs > maxAgeMs;
        const wouldExceedLimit = (screenshotFiles.length - prunedCount) > maxFiles;

        if (isExpired || wouldExceedLimit) {
          try {
            fs.unlinkSync(item.fullPath);
            prunedCount++;
          } catch (err: any) {
            console.error(`[BrowserChassis] Failed to prune screenshot ${item.file}:`, err);
            keepFiles.push(item);
          }
        } else {
          keepFiles.push(item);
        }
      }

      if (prunedCount > 0) {
        this.deps.log('info', `Disk Maintenance: Pruned ${prunedCount} old screenshots from data/screenshots/ (kept ${keepFiles.length})`);
      }

      return { prunedCount, remainingCount: keepFiles.length };
    } catch (err: any) {
      console.error('[BrowserChassis] Error in cleanupScreenshots:', err);
      return { prunedCount: 0, remainingCount: 0 };
    }
  }

  /** Capture a page with one retry burst for the known transient compositor hitches. */
  async captureWithRetry(
    wc: Electron.WebContents,
    bounds: { x: number; y: number; width: number; height: number },
    maxRetries: number = 3,
  ): Promise<Electron.NativeImage> {
    return withPartHighlight(wc, async () => {
      let lastError: any = null;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          return await wc.capturePage({
            x: 0,
            y: 0,
            width: Math.max(1, bounds.width),
            height: Math.max(1, bounds.height),
          });
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || err);
          if (attempt < maxRetries - 1 && (msg.includes('Viz') || msg.includes('compositor') || msg.includes('Gpu') || msg.includes('GPU'))) {
            this.deps.log('warn', `Transient capturePage hitch (${msg}). Retrying in 120ms (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise((r) => setTimeout(r, 120));
            continue;
          }
          throw err;
        }
      }
      throw lastError;
    });
  }

  /**
   * Encode a captured page, save it with retention, emit harvest telemetry and
   * build the response shape both screenshot paths (live viewport and annotated
   * marks) share. `details` receives the post-encode facts for the telemetry
   * message.
   */
  persist(args: {
    image: Electron.NativeImage;
    jpeg: boolean;
    quality: number;
    prefix: string;
    details: (facts: { width: number; height: number; mimeType: string; filePath: string; bytes: number }) => string;
    zoom: ZoomState;
    nativeSize: { width: number; height: number };
  }): ScreenshotPayload {
    const size = args.image.getSize();
    const mimeType = args.jpeg ? 'image/jpeg' : 'image/png';
    const buffer = args.jpeg ? args.image.toJPEG(args.quality) : args.image.toPNG();
    const base64Image = `data:${mimeType};base64,${buffer.toString('base64')}`;

    // Save image to disk & run retention cleanup
    const screenshotsDir = this.dir();
    const filePath = path.join(screenshotsDir, `${args.prefix}${Date.now()}.${args.jpeg ? 'jpg' : 'png'}`);
    fs.writeFileSync(filePath, buffer);
    this.cleanup(50);

    this.deps.telemetry({
      type: 'harvest',
      timestamp: Date.now(),
      details: args.details({
        width: size.width,
        height: size.height,
        mimeType,
        filePath,
        bytes: buffer.length,
      }),
    });

    return {
      base64Image,
      filePath,
      width: size.width,
      height: size.height,
      mimeType,
      zoom: args.zoom,
      nativeWidth: args.nativeSize.width,
      nativeHeight: args.nativeSize.height,
      coordinateScale: args.zoom.viewport.css.width > 0 ? size.width / args.zoom.viewport.css.width : 1,
    };
  }
}
