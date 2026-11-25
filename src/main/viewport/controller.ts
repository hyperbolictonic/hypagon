/**
 * Responsive device emulation for browsing tabs.
 *
 * One controller owns the per-tab device spec and the transitions (set, rotate, reset,
 * re-assert). The HUD, IPC and the agent tool all talk to this class, so the emulation
 * path stays orthogonal to zoom, research and the tab manager.
 *
 * Why this file is small: `catalog.ts` owns the preset list and the saved profiles,
 * `emulation.ts` owns the Chromium calls and "which tab is a device", and
 * `profiles.ts` owns the profile file. This class decides *which* spec a tab has.
 */
import type { WebContents } from 'electron';

import {
  fitViewport,
  normalizeViewportSpec,
  orientationOf,
  rotateSpec,
  type DeviceProfile,
  type ViewportRect,
  type ViewportSpec,
  type ViewportState,
} from '../../shared/viewport.js';
import type { TabInstance } from '../tabs/tab-manager.js';
import { ProfileCatalog } from './catalog.js';
import { DeviceEmulation } from './emulation.js';
import type { DeviceProfileStore } from './profiles.js';

/** When to use: constructing the viewport controller — the profile store, the view and the window hooks. */
export interface ViewportControllerDeps {
  store: DeviceProfileStore;
  /** Full browsing area, in DIP. */
  available: () => { x: number; y: number; width: number; height: number };
  getTab: (tabId: string) => TabInstance | null | undefined;
  getActiveTabId: () => string;
  applyZoom: (wc: WebContents) => void;
  /** Map CSS input coordinates into the letterboxed native view. */
  setInputScale: (wc: WebContents, scale: number) => void;
  /** Re-position the active native view after the frame changes. */
  relayout: () => void;
  broadcast: () => void;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** When to use: `viewport` — the action plus the device/width/height values it applies. */
export interface ViewportSetInput {
  action?: 'status' | 'set' | 'rotate' | 'reset';
  preset?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  touch?: boolean;
}

/** When to use: `viewport` — report, set, rotate and reset the device profile for the active tab. */
export class ViewportController {
  private deps: ViewportControllerDeps;
  private specs = new Map<string, ViewportSpec>();
  private watching = new WeakSet<WebContents>();
  private refreshTimer: NodeJS.Timeout | null = null;

  /** The built-in and saved device presets. */
  readonly catalog: ProfileCatalog;
  private readonly emulation: DeviceEmulation;

  constructor(deps: ViewportControllerDeps) {
    this.deps = deps;
    this.catalog = new ProfileCatalog(deps.store);
    this.emulation = new DeviceEmulation({
      getTab: deps.getTab,
      available: deps.available,
      applyZoom: deps.applyZoom,
      setInputScale: deps.setInputScale,
      log: deps.log,
    });
  }

  /** True while this tab renders as a device. */
  public isEmulated(wc: WebContents): boolean {
    return this.emulation.isEmulated(wc);
  }

  /** Bounds the active tab's native view should occupy, or the full area when not emulated. */
  public frameFor(tabId: string, available: ViewportRect): ViewportRect {
    const spec = this.specs.get(tabId);
    if (!spec) return available;
    const { frame } = fitViewport(spec, available);
    return {
      x: available.x + frame.x,
      y: available.y + frame.y,
      width: frame.width,
      height: frame.height,
    };
  }

  /** The active tab's emulation, the available area and the selectable profiles. */
  public state(): ViewportState {
    const tabId = this.deps.getActiveTabId();
    const spec = tabId ? (this.specs.get(tabId) ?? null) : null;
    const available = this.deps.available();
    const fit = spec ? fitViewport(spec, available) : null;
    return {
      active: Boolean(spec),
      spec,
      orientation: spec ? orientationOf(spec) : 'portrait',
      available: { width: available.width, height: available.height },
      frame: fit?.frame ?? { x: 0, y: 0, width: available.width, height: available.height },
      scale: fit?.scale ?? 1,
      profiles: this.catalog.list(),
    };
  }

  /**
   * The one entry point: status, set, rotate or reset.
   *
   * Reset and rotate are dispatched before the "is there an active tab" guard so a
   * reset still repaints the HUD when the last tab just closed.
   */
  public async set(input: ViewportSetInput = {}): Promise<ViewportState> {
    if (input.action === 'reset') {
      const tabId = this.deps.getActiveTabId();
      if (tabId) {
        this.specs.delete(tabId);
        await this.emulation.clear(tabId);
        this.deps.relayout();
      }
      this.deps.broadcast();
      return this.state();
    }
    if (input.action === 'rotate') return await this.rotateActive();
    if (!input.action || input.action === 'status') return this.state();

    const tabId = this.deps.getActiveTabId();
    if (!tabId) return this.state();

    const current = this.specs.get(tabId);
    let spec: ViewportSpec | null = null;

    if (typeof input.preset === 'string' && input.preset) {
      spec = this.catalog.resolve(input.preset);
    } else if (input.width !== undefined && input.height !== undefined) {
      spec = normalizeViewportSpec(
        {
          profileId: 'custom',
          width: input.width,
          height: input.height,
          deviceScaleFactor: input.deviceScaleFactor ?? current?.deviceScaleFactor ?? 1,
          mobile: input.mobile ?? current?.mobile ?? false,
          touch: input.touch ?? current?.touch ?? false,
        },
        current,
      );
    } else if (current && input.deviceScaleFactor !== undefined) {
      spec = normalizeViewportSpec({ ...current, deviceScaleFactor: input.deviceScaleFactor }, current);
    }

    if (!spec) throw new Error('A device preset or width/height is required.');

    this.specs.set(tabId, spec);
    await this.emulation.applyFor(tabId, spec);
    this.deps.relayout();
    this.deps.broadcast();
    this.deps.log?.('action', `Viewport ${spec.width}x${spec.height} @${spec.deviceScaleFactor}x on ${tabId}`);
    return this.state();
  }

  /** Re-assert emulation for the active tab (tab switch / layout change). */
  public async refreshActive(): Promise<void> {
    const tabId = this.deps.getActiveTabId();
    const spec = tabId ? this.specs.get(tabId) : undefined;
    if (tabId && spec) await this.emulation.applyFor(tabId, spec);
    this.deps.broadcast();
  }

  /** Debounced re-fit after a window resize (the letterbox scale changes with the area). */
  public scheduleRefresh(delayMs = 120): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.refreshActive();
    }, delayMs);
  }

  public unregisterTab(tabId: string): void {
    this.specs.delete(tabId);
  }

  /** Re-apply after every document: Chromium's override is per-renderer and does not survive. */
  public registerTab(tab: TabInstance): void {
    const wc = tab.view.webContents;
    if (this.watching.has(wc)) return;
    this.watching.add(wc);

    const reapply = () => {
      const spec = this.specs.get(tab.id);
      if (spec) void this.emulation.applyFor(tab.id, spec);
    };
    this.emulation.watch(wc, reapply, () => this.unregisterTab(tab.id));
  }

  /** Swap width and height, keeping the rest of the spec. */
  private async rotateActive(): Promise<ViewportState> {
    const tabId = this.deps.getActiveTabId();
    const current = tabId ? this.specs.get(tabId) : null;
    if (!tabId || !current) return this.state();
    const next = rotateSpec(current);
    this.specs.set(tabId, next);
    await this.emulation.applyFor(tabId, next);
    this.deps.relayout();
    this.deps.broadcast();
    return this.state();
  }
}
