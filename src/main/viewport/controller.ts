/**
 * Responsive device emulation for browsing tabs.
 *
 * One controller owns the per-tab device spec, the Chromium emulation calls and the letterbox
 * geometry. The HUD, IPC and the agent tool all talk to this class, so the emulation path stays
 * orthogonal to zoom, research and the tab manager.
 */
import type { WebContents } from 'electron';

import {
  BUILTIN_PROFILES,
  findProfile,
  fitViewport,
  normalizeViewportSpec,
  orientationOf,
  rotateSpec,
  specFromProfile,
  type DeviceProfile,
  type ViewportRect,
  type ViewportSpec,
  type ViewportState,
} from '../../shared/viewport.js';
import type { TabInstance } from '../tabs/tab-manager.js';
import type { DeviceProfileStore } from './profiles.js';
import { applyEmulation, clearEmulation } from './emulation.js';

/** When to use: injecting bounds/emulation hooks when constructing a ViewportController. */
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

/** When to use: shaping a device-emulation change (preset, size, DPR, mobile). */
export interface ViewportSetInput {
  action?: 'status' | 'set' | 'rotate' | 'reset';
  preset?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
  touch?: boolean;
}

/** When to use: applying and reading responsive device emulation for the active tab. */
export class ViewportController {
  private deps: ViewportControllerDeps;
  private specs = new Map<string, ViewportSpec>();
  private emulated = new WeakSet<WebContents>();
  private registered = new WeakSet<WebContents>();
  private applying = new Set<string>();

  constructor(deps: ViewportControllerDeps) {
    this.deps = deps;
  }

  public profiles(): DeviceProfile[] {
    const custom = this.deps.store.list();
    return [...BUILTIN_PROFILES, ...custom];
  }

  public isEmulated(wc: WebContents): boolean {
    return this.emulated.has(wc);
  }

  public getActiveTabId(): string {
    return this.deps.getActiveTabId();
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
      profiles: this.profiles(),
    };
  }

  /** Persist the current device under a human-chosen name. Humans only; not exposed to agents. */
  public saveProfile(input: { name?: unknown; spec?: unknown }): { ok: boolean; profiles: DeviceProfile[] } {
    const saved = this.deps.store.save(input);
    return { ok: Boolean(saved), profiles: this.profiles() };
  }

  public deleteProfile(id: unknown): { ok: boolean; profiles: DeviceProfile[] } {
    const ok = typeof id === 'string' ? this.deps.store.remove(id) : false;
    return { ok, profiles: this.profiles() };
  }

  public async set(input: ViewportSetInput = {}): Promise<ViewportState> {
    const tabId = this.deps.getActiveTabId();
    if (!tabId) return this.state();

    if (input.action === 'reset') return await this.reset();
    if (input.action === 'rotate') return await this.rotate();
    if (!input.action || input.action === 'status') return this.state();

    const current = this.specs.get(tabId);
    let spec: ViewportSpec | null = null;

    if (typeof input.preset === 'string' && input.preset) {
      const profile = findProfile(this.profiles(), input.preset);
      if (!profile) {
        const byName = this.profiles().find(
          (entry) => entry.name.toLowerCase() === input.preset!.toLowerCase(),
        );
        if (!byName) throw new Error(`Unknown device preset "${input.preset}".`);
        spec = specFromProfile(byName);
      } else {
        spec = specFromProfile(profile);
      }
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
    await this.apply(tabId);
    this.deps.relayout();
    this.deps.broadcast();
    this.deps.log?.('action', `Viewport ${spec.width}x${spec.height} @${spec.deviceScaleFactor}x on ${tabId}`);
    return this.state();
  }

  public async rotate(): Promise<ViewportState> {
    const tabId = this.deps.getActiveTabId();
    const current = tabId ? this.specs.get(tabId) : null;
    if (!tabId || !current) return this.state();
    const next = rotateSpec(current);
    this.specs.set(tabId, next);
    await this.apply(tabId);
    this.deps.relayout();
    this.deps.broadcast();
    return this.state();
  }

  public async reset(): Promise<ViewportState> {
    const tabId = this.deps.getActiveTabId();
    if (tabId) {
      this.specs.delete(tabId);
      await this.clear(tabId);
      this.deps.relayout();
    }
    this.deps.broadcast();
    return this.state();
  }

  /** Re-assert emulation for the active tab (tab switch / layout change). */
  public async refreshActive(): Promise<void> {
    const tabId = this.deps.getActiveTabId();
    if (tabId && this.specs.has(tabId)) await this.apply(tabId);
    this.deps.broadcast();
  }

  private refreshTimer: NodeJS.Timeout | null = null;

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
    if (this.registered.has(wc)) return;
    this.registered.add(wc);

    const reapply = () => {
      if (this.specs.has(tab.id)) void this.apply(tab.id);
    };
    wc.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) reapply();
    });
    wc.on('did-navigate', reapply);
    wc.on('did-finish-load', reapply);
    wc.once('destroyed', () => this.unregisterTab(tab.id));
  }

  private async apply(tabId: string): Promise<void> {
    if (this.applying.has(tabId)) return;
    const tab = this.deps.getTab(tabId);
    const spec = this.specs.get(tabId);
    if (!tab || !spec || tab.view.webContents.isDestroyed()) return;

    this.applying.add(tabId);
    const wc = tab.view.webContents;
    const { scale } = fitViewport(spec, this.deps.available());
    try {
      await applyEmulation(wc, spec, scale, this.deps.log);
      this.emulated.add(wc);
      this.deps.setInputScale(wc, scale);
    } finally {
      this.applying.delete(tabId);
    }
  }

  private async clear(tabId: string): Promise<void> {
    const tab = this.deps.getTab(tabId);
    const wc = tab?.view.webContents;
    if (!wc || wc.isDestroyed()) return;

    await clearEmulation(wc);
    this.emulated.delete(wc);
    this.deps.setInputScale(wc, 1);
    this.deps.applyZoom(wc);
    this.deps.log?.('info', `Viewport reset for ${tabId}`);
  }
}
