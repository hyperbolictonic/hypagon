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
import { listFrames } from './frames.js';
import { electronTargetFor } from './electron-targets.js';
import { attachFrameControls as attachControls } from '../../../packages/browser/src/frames/inventory.ts';
import type { ControlFacts } from '../primitives/control-facts.js';
import { loadShadowWalkSettings } from '../shadow-walk/settings.js';
import type { FrameInfo } from './frames.js';

/** When to use: the frames result — one row per frame, with controls and screenshots attached. */
export interface FrameInventoryResult {
  viewport: { width: number; height: number };
  frames: Array<FrameInfo & { controls?: ControlFacts[]; controlsTotal?: number }>;
  images: FrameShot[];
  notes: string[];
}

/** When to use: the inventory reads through these two collaborators. */
export interface FramesInventoryDeps {
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  capturePage: (wc: WebContents, bounds: { x: number; y: number; width: number; height: number }) => Promise<Electron.NativeImage>;
}

/** One cropped frame screenshot, already encoded for the bridge response. */
export interface FrameShot {
  frameId: string;
  url: string;
  name: string;
  base64Image: string;
  width: number;
  height: number;
  mimeType: string;
}

/** When to use: the inventory options, before settings and bounds are applied. */
export interface FramesInventoryOptions {
  includeControls?: boolean;
  screenshots?: boolean;
  maxFrames?: number;
  maxControls?: number;
  selector?: string;
  includeOffscreen?: boolean;
  skipHitTest?: boolean;
  maxSide?: number;
}

type ShadowWalkSettings = ReturnType<typeof loadShadowWalkSettings>;

/** Options and settings resolved once, so every stage reads the same bounded numbers. */
interface FramesLimits {
  settings: ShadowWalkSettings;
  includeControls: boolean;
  wantScreenshots: boolean;
  maxFrames: number;
  maxControls: number;
  maxSide: number;
}

function resolveLimits(options: FramesInventoryOptions): FramesLimits {
  const settings = loadShadowWalkSettings();
  return {
    settings,
    includeControls: options.includeControls !== false && settings.frames.controls,
    wantScreenshots: options.screenshots === true && settings.frames.screenshots,
    maxFrames: Math.min(options.maxFrames ?? settings.frames.maxFrames, settings.frames.maxFrames),
    maxControls: Math.min(options.maxControls ?? settings.frames.maxControls, settings.frames.maxControls),
    maxSide: Math.min(options.maxSide ?? settings.frames.screenshotMaxSide, settings.frames.screenshotMaxSide),
  };
}

/** The advisory lines: no tree, no children, or a feature the settings switched off. */
function inventoryNotes(options: FramesInventoryOptions, limits: FramesLimits, frameCount: number): string[] {
  const notes: string[] = [];
  if (!frameCount) {
    notes.push('No frame tree: the CDP debugger is not attached to the active tab.');
    return notes;
  }
  if (frameCount === 1) notes.push('No child frames on this page.');
  if (options.includeControls !== false && !limits.settings.frames.controls) {
    notes.push('Frame controls are off in Settings → Shadow Walk.');
  }
  if (options.screenshots === true && !limits.settings.frames.screenshots) {
    notes.push('Frame screenshots are off in Settings → Shadow Walk.');
  }
  return notes;
}

/**
 * Re-read every child frame's control facts, offset their rects into the top-level viewport and
 * publish the mark ids they were stamped with. The main frame is not stamped by this scan.
 */
async function attachFrameControls(
  wc: WebContents,
  out: Array<FrameInfo & { controls?: ControlFacts[]; controlsTotal?: number }>,
  options: FramesInventoryOptions,
  limits: FramesLimits,
  _viewport: { width: number; height: number },
): Promise<void> {
  const controlled = await attachControls(electronTargetFor(wc), out, {
    maxFrames: limits.maxFrames,
    selector: options.selector,
    limit: limits.maxControls,
    includeOffscreen: options.includeOffscreen,
    skipHitTest: options.skipHitTest,
    deep: limits.settings.shadow.deepOpenRoots,
    component: limits.settings.shadow.componentSurface,
  });
  out.splice(0, out.length, ...controlled);
}

/** When to use: the chassis frames route — walk the frame tree, attach control facts and per-frame screenshots. */
export async function inventoryFrames(
  wc: WebContents,
  options: FramesInventoryOptions = {},
  deps: FramesInventoryDeps,
): Promise<FrameInventoryResult> {
  const limits = resolveLimits(options);
  deps.log('action', `MCP Directive: frames(controls=${limits.includeControls}, screenshots=${limits.wantScreenshots})`);

  const frames = await listFrames(electronTargetFor(wc), { maxFrames: limits.maxFrames });
  const main = frames.find((frame) => frame.depth === 0);
  const viewport = {
    width: main?.rect.width || 0,
    height: main?.rect.height || 0,
  };
  const notes = inventoryNotes(options, limits, frames.length);
  if (!frames.length) return { viewport, frames: [], images: [], notes };

  const out: Array<FrameInfo & { controls?: ControlFacts[]; controlsTotal?: number }> = frames.map((frame) => ({ ...frame }));

  if (limits.includeControls && frames.length > 1) {
    await attachFrameControls(wc, out, options, limits, viewport);
  }

  let images: FrameShot[] = [];
  if (limits.wantScreenshots && frames.length > 1) {
    images = await captureFrameShots(wc, frames, limits.maxSide, deps).catch(() => []);
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
): Promise<FrameShot[]> {
  const css = await wc.executeJavaScript('({ width: window.innerWidth, height: window.innerHeight })').catch(() => null);
  if (!css?.width || !css?.height) return [];

  const image = await deps.capturePage(wc, { x: 0, y: 0, width: css.width, height: css.height });
  if (!image || image.isEmpty()) return [];
  const size = image.getSize();
  // NativeImage coordinates and getSize() share a unit; derive the ratio instead of assuming DPR.
  const scale = size.width / css.width;

  const shots: FrameShot[] = [];
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
