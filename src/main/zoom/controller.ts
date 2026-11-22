/**
 * Page zoom: the human policy (compensate/native) plus an optional agent
 * override, applied to every tab.
 *
 * Why a module: the chassis carried two zoom fields and six methods that only
 * reasoned about each other — mode, override, the display-scale base factor,
 * the effective factor and the CSS/physical proportions the page renders at.
 * One controller owns that arithmetic; the chassis keeps thin delegations and
 * the broadcast.
 *
 * Device emulation pins the page to 100%: page zoom would change CSS widths
 * inside the emulated viewport, so the controls are inert there, and
 * `getZoomState` reports the emulated proportions instead.
 */
import { clampZoomFactor, nextZoomStep, type ZoomMode, type ZoomSettings, type ZoomState } from '../../shared/zoom.js';
import type { ViewportState } from '../../shared/viewport.js';

/** When to use: building the chassis — everything zoom reads through. */
export interface ZoomControllerDeps {
  /** Scale factor of the display containing the main window. */
  displayScale: () => number;
  /** Device-emulation state, or undefined/null when the feature is off. */
  viewportState?: () => ViewportState | null | undefined;
  /** True when a WebContents is under device emulation; zoom is inert there. */
  isEmulated?: (wc: unknown) => boolean;
  /** The page viewport bounds, physical pixels. */
  bounds: () => { width: number; height: number };
  /** Every open tab's WebContents, so a policy change reaches all of them. */
  webContentsList: () => Array<{ webContents: { isDestroyed(): boolean; setZoomFactor(factor: number): void } }>;
  /** Called after a zoom change (the chassis broadcasts state). */
  onChanged: () => void;
}

export class ZoomController {
  private readonly deps: ZoomControllerDeps;
  private mode: ZoomMode = 'compensate';
  private override: number | null = null;

  constructor(deps: ZoomControllerDeps) {
    this.deps = deps;
  }

  /** The persisted mode (Settings → Zoom); written only from main-process IPC. */
  setSettings(settings: ZoomSettings): void {
    this.mode = settings.mode === 'native' ? 'native' : 'compensate';
    this.override = null;
    this.applyToAllTabs();
    this.deps.onChanged();
  }

  getMode(): ZoomMode {
    return this.mode;
  }

  private baseFactor(): number {
    const scale = this.deps.displayScale();
    return this.mode === 'compensate' && scale > 0 ? 1 / scale : 1;
  }

  private effectiveFactor(): number {
    return clampZoomFactor(this.override ?? this.baseFactor());
  }

  /** Report the policy plus the CSS/physical proportions the page is rendered at. */
  getState(): ZoomState {
    const displayScale = this.deps.displayScale();
    const responsive = this.deps.viewportState?.() ?? null;
    if (responsive?.active && responsive.spec) {
      // Device emulation defines the page's CSS world; report those proportions so screenshots,
      // marks and act coordinates still line up.
      const spec = responsive.spec;
      return {
        mode: this.mode,
        displayScale,
        baseFactor: 1,
        factor: 1,
        custom: true,
        devicePixelRatio: spec.deviceScaleFactor,
        viewport: {
          css: { width: spec.width, height: spec.height },
          physical: {
            width: Math.round(spec.width * responsive.scale * displayScale),
            height: Math.round(spec.height * responsive.scale * displayScale),
          },
        },
      };
    }

    const baseFactor = this.baseFactor();
    const factor = this.effectiveFactor();
    let bounds = { width: 0, height: 0 };
    try {
      bounds = this.deps.bounds();
    } catch {
      // A hidden settings surface can leave the bounds temporarily unavailable.
    }
    const cssWidth = factor > 0 ? bounds.width / factor : bounds.width;
    const cssHeight = factor > 0 ? bounds.height / factor : bounds.height;
    return {
      mode: this.mode,
      displayScale,
      baseFactor,
      factor,
      custom: this.override !== null,
      devicePixelRatio: displayScale * factor,
      viewport: {
        css: { width: Math.round(cssWidth), height: Math.round(cssHeight) },
        physical: {
          width: Math.round(bounds.width * displayScale),
          height: Math.round(bounds.height * displayScale),
        },
      },
    };
  }

  /** Apply the effective factor to one WebContents; emulated tabs are exempt. */
  applyTo(wc: { isDestroyed(): boolean; setZoomFactor(factor: number): void }): void {
    try {
      if (this.deps.isEmulated?.(wc)) return;
      if (!wc.isDestroyed()) wc.setZoomFactor(this.effectiveFactor());
    } catch {
      // A tab can be destroyed between the event and this call.
    }
  }

  applyToAllTabs(): void {
    for (const tab of this.deps.webContentsList()) this.applyTo(tab.webContents);
  }

  /**
   * Change page zoom for every tab.
   *
   * `mode` follows the human policy; `action` is a Chrome-like step; `factor`
   * is an exact zoom from an agent. An explicit change overrides the policy base
   * until `reset` or a mode switch.
   */
  setZoom(input: {
    action?: 'status' | 'in' | 'out' | 'reset';
    factor?: number;
    mode?: ZoomMode;
  } = {}): ZoomState {
    if (this.deps.viewportState?.()?.active) return this.getState();

    if (input.mode === 'compensate' || input.mode === 'native') {
      this.mode = input.mode;
      this.override = null;
    }

    if (input.factor !== undefined) {
      this.override = clampZoomFactor(input.factor);
    } else if (input.action === 'reset') {
      this.override = null;
    } else if (input.action === 'in' || input.action === 'out') {
      this.override = clampZoomFactor(nextZoomStep(this.effectiveFactor(), input.action));
    }

    this.applyToAllTabs();
    this.deps.onChanged();
    return this.getState();
  }
}
