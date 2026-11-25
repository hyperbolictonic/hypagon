/**
 * Making a tab *be* a device, and undoing it.
 *
 * Why a module: the CDP metrics override, the touch flag, the WebContents fallback
 * (when DevTools or another client owns the debugger), the page-zoom pin, the
 * per-document re-apply and "is this tab emulated" are one mechanism. The controller
 * decides *which* spec a tab has; this applies it.
 */
import type { WebContents } from 'electron';
import { fitViewport, type ViewportSpec } from '../../shared/viewport.js';
import type { TabInstance } from '../tabs/tab-manager.js';

/** When to use: `ViewportController` — the emulation driver plus the app's hooks. */
export interface DeviceEmulationDeps {
  /** The tab's native view, or nothing when it has closed. */
  getTab: (tabId: string) => TabInstance | null | undefined;
  /** The full browsing area, in DIP (the letterbox scale depends on it). */
  available: () => { x: number; y: number; width: number; height: number };
  /** Restore the app's display-scale zoom policy (reset only). */
  applyZoom: (wc: WebContents) => void;
  /** Map CSS input coordinates into the letterboxed native view. */
  setInputScale: (wc: WebContents, scale: number) => void;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** When to use: `ViewportController` — one driver per controller. */
export class DeviceEmulation {
  private readonly deps: DeviceEmulationDeps;
  /** Tabs that currently carry an override (reset and status read this). */
  private readonly emulated = new WeakSet<WebContents>();
  /** Re-entrancy: a navigation can fire while the override is still being applied. */
  private readonly applying = new Set<string>();

  constructor(deps: DeviceEmulationDeps) {
    this.deps = deps;
  }

  /** True while this tab renders as a device. */
  isEmulated(wc: WebContents): boolean {
    return this.emulated.has(wc);
  }

  /** Apply a spec to a tab; resolves to its WebContents when the override landed. */
  async applyFor(tabId: string, spec: ViewportSpec): Promise<WebContents | null> {
    if (this.applying.has(tabId)) return null;
    const tab = this.deps.getTab(tabId);
    if (!tab || tab.view.webContents.isDestroyed()) return null;

    this.applying.add(tabId);
    const wc = tab.view.webContents;
    try {
      const { scale } = fitViewport(spec, this.deps.available());
      await this.override(wc, spec, scale);
      this.emulated.add(wc);
      return wc;
    } finally {
      this.applying.delete(tabId);
    }
  }

  /** Drop the override and restore the app's zoom and input mapping. */
  async clear(tabId: string): Promise<void> {
    const tab = this.deps.getTab(tabId);
    const wc = tab?.view.webContents;
    if (!wc || wc.isDestroyed()) return;

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
    this.emulated.delete(wc);
    this.deps.setInputScale(wc, 1);
    this.deps.applyZoom(wc);
    this.deps.log?.('info', `Viewport reset for ${tabId}`);
  }

  /**
   * Re-apply after every document: Chromium's override is per-renderer and does not
   * survive a navigation. Wired once per WebContents.
   */
  watch(wc: WebContents, reapply: () => void, onDestroyed: () => void): void {
    wc.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) reapply();
    });
    wc.on('did-navigate', reapply);
    wc.on('did-finish-load', reapply);
    wc.once('destroyed', onDestroyed);
  }

  /** The Chromium calls themselves: CDP first, then the WebContents fallback. */
  private async override(wc: WebContents, spec: ViewportSpec, scale: number): Promise<void> {
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
      this.deps.log?.(
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
    this.deps.setInputScale(wc, scale);
  }
}
