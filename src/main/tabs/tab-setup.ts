/**
 * Tab and viewport setup.
 *
 * Owns the tab manager and the responsive viewport controller: building both,
 * sizing the page viewport from the window, wiring the tab events and keeping
 * the native bounds in step with the deck and window resize. The chassis supplies
 * the window, host profile and the collaborators the two controllers read.
 */
import type { BrowserWindow, WebContents } from 'electron';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import { DeviceProfileStore } from '../viewport/profiles.js';
import { ViewportController } from '../viewport/controller.js';
import { TabManager } from './tab-manager.js';
import type { TabEventHandlers } from './tab-events.js';

/** The page viewport rect inside the shell window. */
export interface ViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Dependencies the tab setup needs from the shell window and controllers. */
export interface TabSetupDeps {
  window(): BrowserWindow | null;
  hostProfile: HostBrowserProfile;
  /** Where the device profile list is persisted. */
  deviceProfilesPath(): string;
  /** Whether the deck is docked (it narrows the page viewport). */
  docked(): boolean;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  broadcastState(): void;
  positionDeck(): void;
  bringDeckToFront(): void;
  /** Apply a toolbar zoom step. */
  applyZoomStep(action: 'in' | 'out' | 'reset' | 'status'): void;
  applyZoom(wc: WebContents): void;
  setInputScale(wc: WebContents, scale: number): void;
  toggleHuman(): void;
  tabEvents: TabEventHandlers;
}

/** The tab manager and responsive viewport controller, built once per window. */
export class TabSetupSurface {
  manager: TabManager | null = null;
  viewport: ViewportController | null = null;
  private readonly deps: TabSetupDeps;

  constructor(deps: TabSetupDeps) {
    this.deps = deps;
  }

  /** The tab manager, or the standard uninitialized failure. */
  requireManager(): TabManager {
    if (!this.manager) throw new Error('Browser Chassis uninitialized');
    return this.manager;
  }

  /** The viewport controller, or the standard uninitialized failure. */
  requireViewport(): ViewportController {
    if (!this.viewport) throw new Error('Browser Chassis uninitialized');
    return this.viewport;
  }

  /** Bounds of the page viewport as laid out in the HUD (deck- and tab-bar-aware). */
  bounds(): ViewportBounds {
    const win = this.deps.window();
    if (!win) return { x: 0, y: 0, width: 0, height: 0 };
    // Child-view bounds are relative to the content area (excluding the title
    // bar and menu), so size the page viewport from the content size.
    const [winWidth, winHeight] = win.getContentSize();
    const rightPanelWidth = this.deps.docked() ? 420 : 0;
    // With tab bar, top bar height is 100px (64px navbar + 36px tab bar)
    const topBarHeight = 100;

    const viewportWidth = Math.max(400, winWidth - rightPanelWidth);
    const viewportHeight = Math.max(300, winHeight - topBarHeight);

    return {
      x: 0,
      y: topBarHeight,
      width: viewportWidth,
      height: viewportHeight,
    };
  }

  /** Build the viewport controller, then the tab manager and its first tab. */
  setup(): void {
    const win = this.deps.window();
    if (!win) return;

    this.viewport = new ViewportController({
      store: new DeviceProfileStore(this.deps.deviceProfilesPath()),
      available: () => this.bounds(),
      getTab: (tabId) => this.manager?.getTab(tabId) ?? null,
      getActiveTabId: () => this.manager?.getActiveTabId() ?? '',
      applyZoom: (wc) => this.deps.applyZoom(wc),
      setInputScale: (wc, scale) => this.deps.setInputScale(wc, scale),
      relayout: () => this.manager?.updateActiveTabBounds(),
      broadcast: () => this.deps.broadcastState(),
      log: (level, message) => this.deps.log(level, message),
    });

    this.manager = new TabManager({
      mainWindow: win,
      hostProfile: this.deps.hostProfile,
      getViewportBounds: () => this.bounds(),
      getTabBounds: (tabId) => this.viewport?.frameFor(tabId, this.bounds()) ?? this.bounds(),
      applyZoom: (wc) => this.deps.applyZoom(wc),
      onZoomShortcut: (action) => this.deps.applyZoomStep(action),
      onTakeoverShortcut: () => this.deps.toggleHuman(),
      onRendererGone: this.deps.tabEvents.onRendererGone,
      onTabUpdated: this.deps.tabEvents.onTabUpdated,
      onTabsChanged: this.deps.tabEvents.onTabsChanged,
      onTabCreated: this.deps.tabEvents.onTabCreated,
      onViewAdded: () => this.deps.bringDeckToFront(),
      onTabClosed: (tabId) => this.viewport?.unregisterTab(tabId),
      onLog: (level, message) => this.deps.log(level, message),
      onConsoleLog: this.deps.tabEvents.onConsoleLog,
    });

    this.deps.log(
      'info',
      `Stealth Profile Active: Spoofing host ${this.deps.hostProfile.name} v${this.deps.hostProfile.version}`,
    );

    // Create initial default tab
    this.manager.createTab('about:blank');

    win.on('resize', () => {
      this.deps.positionDeck();
      this.manager?.updateActiveTabBounds();
      this.viewport?.scheduleRefresh();
    });
  }
}
