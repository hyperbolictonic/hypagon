/**
 * Frame inventory: the frame tree, per-frame control facts and per-frame
 * screenshots.
 *
 * Why a module: `getFrames` was the largest remaining chassis body — a
 * stateless pipeline over (webContents, Shadow Walk settings, options) that
 * only touched the chassis for logging and the page capture. Extracted so the
 * chassis keeps the guard and the delegation, and the geometry/offset logic
 * has one home.
 *
 * Frame-local control rects are offset into the top-level viewport, so the
 * result can be clicked with act(x, y) or read coordinate-free. Opt-in and
 * bounded: the frame walk costs CDP commands per frame, and screenshots cost
 * one capture plus one crop per visible frame.
 */
import type { WebContents } from 'electron';
import { clearFrameMarks, registerFrameMarks } from './frame-marks.js';
import { listFrames } from './frames.js';
import { evaluateInFrames } from './frame-eval.js';
import { controlFactsExpression, parseControlFacts, type ControlFacts } from '../primitives/control-facts.js';
import { loadShadowWalkSettings } from '../shadow-walk/settings.js';
import type { FrameInfo } from './frames.js';

/** When to use: the frames result — one row per frame, with controls and screenshots attached. */
export interface FrameInventoryResult {
  viewport: { width: number; height: number };
  frames: Array<FrameInfo & { controls?: ControlFacts[]; controlsTotal?: number }>;
  images: Array<{ frameId: string; url: string; name: string; base64Image: string; width: number; height: number; mimeType: string }>;
  notes: string[];
}

/** When to use: the inventory reads through these two collaborators. */
export interface FramesInventoryDeps {
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  capturePage: (wc: WebContents, bounds: { x: number; y: number; width: number; height: number }) => Promise<Electron.NativeImage>;
}

/** When to use: the chassis frames route — walk the frame tree, attach control facts and per-frame screenshots. */
export async function inventoryFrames(
  wc: WebContents,
  options: {
    includeControls?: boolean;
    screenshots?: boolean;
    maxFrames?: number;
    maxControls?: number;
    selector?: string;
    includeOffscreen?: boolean;
    skipHitTest?: boolean;
    maxSide?: number;
  } = {},
  deps: FramesInventoryDeps,
): Promise<FrameInventoryResult> {
  const settings = loadShadowWalkSettings();
  const includeControls = options.includeControls !== false && settings.frames.controls;
  const wantScreenshots = options.screenshots === true && settings.frames.screenshots;
  const maxFrames = Math.min(options.maxFrames ?? settings.frames.maxFrames, settings.frames.maxFrames);
  const maxControls = Math.min(options.maxControls ?? settings.frames.maxControls, settings.frames.maxControls);
  const maxSide = Math.min(options.maxSide ?? settings.frames.screenshotMaxSide, settings.frames.screenshotMaxSide);
  deps.log('action', `MCP Directive: frames(controls=${includeControls}, screenshots=${wantScreenshots})`);

  const frames = await listFrames(wc, { maxFrames });
  const notes: string[] = [];
  const main = frames.find((f) => f.depth === 0);
  const viewport = {
    width: main?.rect.width || 0,
    height: main?.rect.height || 0,
  };
  if (!frames.length) {
    notes.push('No frame tree: the CDP debugger is not attached to the active tab.');
    return { viewport, frames: [], images: [], notes };
  }
  if (frames.length === 1) notes.push('No child frames on this page.');
  if (options.includeControls !== false && !settings.frames.controls) {
    notes.push('Frame controls are off in Settings → Shadow Walk.');
  }
  if (options.screenshots === true && !settings.frames.screenshots) {
    notes.push('Frame screenshots are off in Settings → Shadow Walk.');
  }

  const out: Array<FrameInfo & { controls?: ControlFacts[]; controlsTotal?: number }> = frames.map((f) => ({ ...f }));

  if (includeControls && frames.length > 1) {
    const limit = Math.max(1, Math.min(maxControls, 200));
    clearFrameMarks(wc);
    // One expression, one frame-tree walk. Each child frame gets its own mark-id block
    // (100 + child_index * 100); the main frame is not stamped by this scan.
    const evaluated = await evaluateInFrames(
      wc,
      'null',
      {
        maxFrames,
        expressionForFrame: (_frame, index) =>
          index === 0
            ? 'null'
            : controlFactsExpression({
                selector: options.selector,
                limit,
                includeOffscreen: true,
                skipHitTest: options.skipHitTest === true,
                deep: settings.shadow.deepOpenRoots,
                markIdBase: 100 + (index - 1) * 100,
                component: settings.shadow.componentSurface,
              }),
      }
    );

    const byId = new Map(out.map((f) => [f.frameId, f]));
    for (const result of evaluated) {
      const frame = byId.get(result.frameId);
      if (!frame || frame.depth === 0 || !result.ok) continue;
      const parsed = parseControlFacts(result.value);
      const controls: ControlFacts[] = [];
      for (const control of parsed.controls) {
        const rect = {
          x: control.rect.x + frame.rect.x,
          y: control.rect.y + frame.rect.y,
          width: control.rect.width,
          height: control.rect.height,
        };
        const onScreen =
          rect.width > 0 &&
          rect.height > 0 &&
          rect.x < viewport.width &&
          rect.y < viewport.height &&
          rect.x + rect.width > 0 &&
          rect.y + rect.height > 0;
        if (!options.includeOffscreen && !onScreen) continue;
        controls.push({
          ...control,
          rect,
          visible: control.visible && !!frame.visibleRect,
          occluded: control.occluded || !onScreen,
        });
      }
      frame.controls = controls;
      frame.controlsTotal = parsed.controls.length;
      registerFrameMarks(
        wc,
        controls
          .filter((control) => typeof control.id === 'number' && control.id >= 100)
          .map((control) => ({ id: Number(control.id), frameId: frame.frameId }))
      );
    }
  }

  let images: Array<{ frameId: string; url: string; name: string; base64Image: string; width: number; height: number; mimeType: string }> = [];
  if (wantScreenshots && frames.length > 1) {
    images = await captureFrameShots(wc, frames, maxSide, deps).catch(() => []);
    if (!images.length) notes.push('Frame screenshots unavailable (capture failed or every frame is offscreen).');
  }

  return { viewport, frames: out, images, notes };
}

/**
 * One viewport capture, cropped per visible frame. Cheaper and more predictable than a CDP clip
 * per frame: Chromium clips live in page coordinates, while the frame rects here are already in
 * viewport coordinates.
 */
async function captureFrameShots(
  wc: WebContents,
  frames: FrameInfo[],
  maxSide: number,
  deps: FramesInventoryDeps,
): Promise<Array<{ frameId: string; url: string; name: string; base64Image: string; width: number; height: number; mimeType: string }>> {
  const css = await wc.executeJavaScript('({ width: window.innerWidth, height: window.innerHeight })').catch(() => null);
  if (!css?.width || !css?.height) return [];

  const image = await deps.capturePage(wc, { x: 0, y: 0, width: css.width, height: css.height });
  if (!image || image.isEmpty()) return [];
  const size = image.getSize();
  // NativeImage coordinates and getSize() share a unit; derive the ratio instead of assuming DPR.
  const scale = size.width / css.width;

  const shots: Array<{ frameId: string; url: string; name: string; base64Image: string; width: number; height: number; mimeType: string }> = [];
  for (const frame of frames) {
    if (frame.depth === 0 || !frame.visibleRect) continue;
    const rect = frame.visibleRect;
    const x = Math.max(0, Math.min(size.width - 1, Math.round(rect.x * scale)));
    const y = Math.max(0, Math.min(size.height - 1, Math.round(rect.y * scale)));
    const width = Math.max(1, Math.min(size.width - x, Math.round(rect.width * scale)));
    const height = Math.max(1, Math.min(size.height - y, Math.round(rect.height * scale)));
    if (width < 8 || height < 8) continue;

    try {
      let cropped = image.crop({ x, y, width, height });
      const croppedSize = cropped.getSize();
      const shrink = Math.min(1, maxSide / Math.max(croppedSize.width, croppedSize.height));
      if (shrink < 1) {
        cropped = cropped.resize({
          width: Math.max(1, Math.round(croppedSize.width * shrink)),
          height: Math.max(1, Math.round(croppedSize.height * shrink)),
          quality: 'good',
        });
      }
      const final = cropped.getSize();
      shots.push({
        frameId: frame.frameId,
        url: frame.url,
        name: frame.name,
        base64Image: cropped.toJPEG(82).toString('base64'),
        width: final.width,
        height: final.height,
        mimeType: 'image/jpeg',
      });
    } catch (err: any) {
      deps.log('warn', `Frame crop failed for ${frame.url || frame.frameId}: ${err?.message || err}`);
    }
  }
  return shots;
}
