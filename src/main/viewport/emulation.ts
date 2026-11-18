/**
 * Chromium device-emulation calls for one tab.
 *
 * The controller owns per-tab specs and letterbox geometry; this module owns the
 * debugger sequence that actually makes a page believe it is a phone. CDP is the
 * primary path (it also applies touch and orientation); when another client owns the
 * debugger, the WebContents emulation API is the fallback.
 *
 * When to use: applying or clearing device metrics for a tab. Do not call
 * `Emulation.setDeviceMetricsOverride` anywhere else.
 */

import type { WebContents } from 'electron';
import type { ViewportSpec } from '../../shared/viewport.js';

/** When to use: passing the controller's logger into the emulation calls. */
export type ViewportLog = (level: 'info' | 'warn' | 'action', message: string) => void;

/**
 * When to use: applying a device spec to a tab. Pins page zoom to 100%, then sets
 * metrics + touch over CDP, falling back to the WebContents emulation API.
 */
export async function applyEmulation(
  wc: WebContents,
  spec: ViewportSpec,
  scale: number,
  log?: ViewportLog,
): Promise<void> {
  // Device mode is the page's world; the app's display-scale zoom would change CSS widths
  // inside it. Pin page zoom to 100% and restore the policy on reset.
  try {
    wc.setZoomFactor(1);
  } catch {
    /* a tab can vanish mid-change */
  }

  let cdp = false;
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: spec.width,
      height: spec.height,
      deviceScaleFactor: spec.deviceScaleFactor,
      mobile: spec.mobile,
      screenWidth: spec.width,
      screenHeight: spec.height,
      screenOrientation: {
        angle: 0,
        type: spec.mobile ? 'portraitPrimary' : 'landscapePrimary',
      },
      scale,
    });
    await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
      enabled: spec.touch,
      maxTouchPoints: spec.touch ? 5 : 0,
    });
    cdp = true;
  } catch (error: any) {
    // DevTools or another client can own the debugger. The WebContents API still emulates.
    log?.(
      'info',
      `Device emulation via CDP unavailable (${error?.message || error}); using the WebContents path.`,
    );
  }

  if (!cdp) {
    wc.enableDeviceEmulation({
      screenPosition: spec.mobile ? 'mobile' : 'desktop',
      screenSize: { width: spec.width, height: spec.height },
      viewPosition: { x: 0, y: 0 },
      deviceScaleFactor: spec.deviceScaleFactor,
      viewSize: { width: spec.width, height: spec.height },
      scale,
    });
  }
}

/** When to use: removing device metrics and touch emulation from a tab (viewport reset). */
export async function clearEmulation(wc: WebContents): Promise<void> {
  try {
    if (wc.debugger.isAttached()) {
      await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
      await wc.debugger.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => undefined);
    }
  } catch {
    /* debugger detached while resetting */
  }
  try {
    wc.disableDeviceEmulation();
  } catch {
    /* not emulated */
  }
}
