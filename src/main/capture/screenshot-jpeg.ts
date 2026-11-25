/**
 * Baseline screenshot for a model.
 *
 * Captures the visible viewport and fits it inside TypeSafe's image limits
 * (longest side ≤ maxSide, shortest ≥ 280) so a decision model can see the page
 * without paying for a full-resolution frame.
 */
import type { NativeImage } from 'electron';

/** Dependencies the capture needs from the active tab. */
export interface ScreenshotJpegDeps {
  capturePage(): Promise<NativeImage>;
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** When to use: `decide(include_screenshot)` — a bounded baseline JPEG of the viewport. */
export async function captureScreenshotJpeg(
  deps: ScreenshotJpegDeps,
  maxSide = 1400,
  quality = 82,
): Promise<{ base64: string; width: number; height: number } | null> {
  try {
    const image = await deps.capturePage();
    if (!image || image.isEmpty()) return null;
    const size = image.getSize();
    if (!size.width || !size.height) return null;

    const shrink = Math.min(1, maxSide / Math.max(size.width, size.height));
    let out = shrink < 1
      ? image.resize({ width: Math.round(size.width * shrink), height: Math.round(size.height * shrink), quality: 'good' })
      : image;

    const after = out.getSize();
    const smallest = Math.min(after.width, after.height);
    if (smallest > 0 && smallest < 280) {
      const grow = 280 / smallest;
      out = out.resize({ width: Math.round(after.width * grow), height: Math.round(after.height * grow), quality: 'good' });
    }

    const final = out.getSize();
    const buffer = out.toJPEG(quality);
    return { base64: buffer.toString('base64'), width: final.width, height: final.height };
  } catch (error: any) {
    deps.log('warn', `Screenshot capture failed: ${error?.message || error}`);
    return null;
  }
}
