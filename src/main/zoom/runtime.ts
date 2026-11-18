/**
 * Page-zoom policy.
 *
 * Two concerns live here and nowhere else:
 *
 * 1. The human policy — `compensate` (divide by the display scale so 100% looks like
 *    100% on a scaled desktop) versus `native` — plus an explicit override that wins
 *    until the next reset or mode switch.
 * 2. The proportions the page is actually rendered at, which screenshots, marks and
 *    act coordinates must agree with. Device emulation defines that world directly,
 *    so zoom is pinned inert while a device is active.
 *
 * When to use: the deck or the MCP zoom tool changes zoom, or any caller needs the
 * CSS/physical viewport proportions for a screenshot or a coordinate.
 */

import type { WebContents } from 'electron';
import { clampZoomFactor, nextZoomStep, type ZoomMode, type ZoomSettings, type ZoomState } from '../../shared/zoom.js';
import type { ViewportState } from '../../shared/viewport.js';

/**
 * When to use: implement this when constructing a `ZoomRuntime` — the chassis
 * supplies display/tab/viewport access and the HUD broadcast.
 */
export interface ZoomRuntimeHost {
  /** Scale factor of the display holding the main window (1 when unknown). */
  displayScale: () => number;
  /** Bounds of the page area, in device-independent pixels. */
  viewportBounds: () => { width: number; height: number };
  /** Active responsive device emulation, if any. */
  viewportState: () => ViewportState | null;
  /** Whether this tab is device-emulated (zoom is inert while it is). */
  isEmulated: (wc: WebContents) => boolean;
  /** Every live tab's WebContents. */
  tabs: () => WebContents[];
  /** Push the new zoom into the HUD state stream. */
  broadcastState: () => void;
}

/**
 * When to use: the chassis, the deck or the MCP zoom tool needs the page-zoom policy,
 * a zoom step, an exact factor, or the rendered CSS/physical proportions.
 */
export class ZoomRuntime {
  private mode: ZoomMode = 'compensate';
  private override: number | null = null;

  constructor(private readonly host: ZoomRuntimeHost) {}

  /** Install the persisted page-zoom policy (compensate vs Windows scale). */
  public setSettings(settings: ZoomSettings): void {
    this.mode = settings.mode === 'native' ? 'native' : 'compensate';
    this.override = null;
    this.applyToAllTabs();
    this.host.broadcastState();
  }

  public getMode(): ZoomMode {
    return this.mode;
  }

  private getBaseFactor(): number {
    const scale = this.host.displayScale();
    return this.mode === 'compensate' && scale > 0 ? 1 / scale : 1;
  }

  private getEffectiveFactor(): number {
    return clampZoomFactor(this.override ?? this.getBaseFactor());
  }

  /** Report the policy plus the CSS/physical proportions the page is rendered at. */
  public getState(): ZoomState {
    const displayScale = this.host.displayScale();
    const responsive = this.host.viewportState();
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

    const baseFactor = this.getBaseFactor();
    const factor = this.getEffectiveFactor();
    let bounds = { width: 0, height: 0 };
    try {
      bounds = this.host.viewportBounds();
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

  /** Apply the current factor to one tab, unless emulation owns its CSS world. */
  public applyTo(wc: WebContents): void {
    try {
      if (this.host.isEmulated(wc)) return;
      if (!wc.isDestroyed()) wc.setZoomFactor(this.getEffectiveFactor());
    } catch {
      // A tab can be destroyed between the event and this call.
    }
  }

  public applyToAllTabs(): void {
    for (const wc of this.host.tabs()) this.applyTo(wc);
  }

  /**
   * Change page zoom for every tab.
   *
   * `mode` follows the human policy; `action` is a Chrome-like step; `factor`
   * is an exact zoom from an agent. An explicit change overrides the policy base
   * until `reset` or a mode switch.
   */
  public set(input: { action?: 'status' | 'in' | 'out' | 'reset'; factor?: number; mode?: ZoomMode } = {}): ZoomState {
    // Device emulation pins the page to 100%: page zoom would change CSS widths inside the
    // emulated viewport. Keep the zoom controls inert until the device is reset.
    if (this.host.viewportState()?.active) return this.getState();

    if (input.mode === 'compensate' || input.mode === 'native') {
      this.mode = input.mode;
      this.override = null;
    }

    if (input.factor !== undefined) {
      this.override = clampZoomFactor(input.factor);
    } else if (input.action === 'reset') {
      this.override = null;
    } else if (input.action === 'in' || input.action === 'out') {
      this.override = clampZoomFactor(nextZoomStep(this.getEffectiveFactor(), input.action));
    }

    this.applyToAllTabs();
    this.host.broadcastState();
    return this.getState();
  }
}
