/**
 * Tabs for the Cyberdeck browser.
 *
 * One `WebContentsView` per tab, attached to the shell window and swapped by bounds.
 * The manager owns the tab map and which one is active; the view policy lives in
 * `tab-views.ts` and the popup/sign-in window policy in `popups.ts`.
 */
import type { WebContentsView } from 'electron';
import type { TabSummary } from '../../shared/types.js';
import { PopupWindows } from './popups.js';
import { TabViews } from './tab-views.js';
import type { TabInstance, TabManagerOptions } from './types.js';

export type { TabInstance, TabManagerOptions } from './types.js';

/** When to use: creating, switching and closing tabs. */
export class TabManager {
  private tabs: Map<string, TabInstance> = new Map();
  private activeTabId: string = '';
  private counter: number = 0;
  /** Set while a full-window settings/dialog surface owns the UI. */
  private viewportHidden: boolean = false;
  private readonly options: TabManagerOptions;
  private readonly views: TabViews;
  private readonly popups: PopupWindows;

  constructor(options: TabManagerOptions) {
    this.options = options;
    this.popups = new PopupWindows({
      mainWindow: options.mainWindow,
      hostProfile: options.hostProfile,
      ...(options.applyZoom === undefined ? {} : { applyZoom: options.applyZoom }),
      ...(options.onLog === undefined ? {} : { onLog: options.onLog }),
      openTab: (url) => {
        const tab = this.createTab(url);
        this.switchTab(tab.id);
      },
      activeContents: () => this.tabs.get(this.activeTabId)?.view.webContents,
    });
    this.views = new TabViews({
      mainWindow: options.mainWindow,
      hostProfile: options.hostProfile,
      ...(options.onViewAdded === undefined ? {} : { onViewAdded: options.onViewAdded }),
      ...(options.onTabCreated === undefined ? {} : { onTabCreated: options.onTabCreated }),
      ...(options.onTabUpdated === undefined ? {} : { onTabUpdated: options.onTabUpdated }),
      onTabsChanged: () => this.notifyTabsChanged(),
      ...(options.onConsoleLog === undefined ? {} : { onConsoleLog: options.onConsoleLog }),
      ...(options.onRendererGone === undefined ? {} : { onRendererGone: options.onRendererGone }),
      ...(options.applyZoom === undefined ? {} : { applyZoom: options.applyZoom }),
      ...(options.onZoomShortcut === undefined ? {} : { onZoomShortcut: options.onZoomShortcut }),
      ...(options.onTakeoverShortcut === undefined ? {} : { onTakeoverShortcut: options.onTakeoverShortcut }),
      ...(options.onLog === undefined ? {} : { onLog: options.onLog }),
      openLinkInNewTab: (url) => {
        try {
          const tab = this.createTab(url);
          this.switchTab(tab.id);
        } catch (err) {
          // Worst case the link still opens via "open in system browser".
          options.onLog?.('warn', `Could not open link in a new tab: ${(err as Error)?.message || err}`);
        }
      },
      wireWindowOpen: (wc) => this.popups.wire(wc),
    });
  }

  public getWelcomePagePath(): string {
    return this.views.welcomePagePath();
  }

  public getActiveTab(): TabInstance {
    const active = this.tabs.get(this.activeTabId);
    if (!active) {
      throw new Error('No active tab available in Cyberdeck');
    }
    return active;
  }

  /** Look up a tab without throwing (used by viewport emulation). */
  public getTab(tabId: string): TabInstance | undefined {
    return this.tabs.get(tabId);
  }

  public getActiveTabId(): string {
    return this.activeTabId;
  }

  /** All open tabs, for tab-wide policy updates (force-open arming). */
  public allTabs(): TabInstance[] {
    return [...this.tabs.values()];
  }

  public createTab(initialUrl: string = 'about:blank', existingView?: WebContentsView): TabInstance {
    this.counter++;
    const id = `tab_${this.counter}`;

    const tab = this.views.create(id, initialUrl, existingView);
    const wc = tab.view.webContents;

    this.tabs.set(id, tab);

    // If view was already prerendered, it is already loaded
    if (existingView) {
      tab.title = wc.getTitle() || 'Prerendered Page';
      tab.isLoading = false;
      this.options.onTabUpdated?.(tab);
      this.notifyTabsChanged();
    } else if (initialUrl && initialUrl !== 'about:blank' && initialUrl !== 'mark-eleven://manual') {
      const formatted = initialUrl.startsWith('http://') || initialUrl.startsWith('https://')
        ? initialUrl
        : `https://${initialUrl}`;
      wc.loadURL(formatted);
    } else {
      wc.loadFile(this.views.welcomePagePath());
    }

    // Switch focus to new tab
    this.switchTab(id);
    return tab;
  }

  public switchTab(tabId: string): void {
    if (!this.tabs.has(tabId)) {
      throw new Error(`Tab ${tabId} does not exist`);
    }

    // Hide previous active tab view by tucking its bounds away
    if (this.activeTabId && this.tabs.has(this.activeTabId) && this.activeTabId !== tabId) {
      const prev = this.tabs.get(this.activeTabId)!;
      prev.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }

    this.activeTabId = tabId;
    const current = this.tabs.get(tabId)!;
    this.options.applyZoom?.(current.view.webContents);

    // Expand current active tab to viewport container, unless a settings
    // surface is currently covering the window.
    const bounds = this.viewportHidden
      ? { x: 0, y: 0, width: 0, height: 0 }
      : (this.options.getTabBounds?.(tabId) ?? this.options.getViewportBounds());
    current.view.setBounds(bounds);

    this.options.onLog?.('info', `Switched active browsing node to [${current.id}] "${current.title}"`);
    this.options.onTabUpdated?.(current);
    this.notifyTabsChanged();
  }

  public closeTab(tabId?: string): void {
    const targetId = tabId || this.activeTabId;
    if (!this.tabs.has(targetId)) return;

    const tabToClose = this.tabs.get(targetId)!;

    // If only 1 tab remaining, reset it to Cyberdeck manual rather than closing window
    if (this.tabs.size <= 1) {
      tabToClose.view.webContents.loadFile(this.views.welcomePagePath());
      tabToClose.title = 'Kuang Grade // Manual';
      tabToClose.url = 'mark-eleven://manual';
      this.options.onTabUpdated?.(tabToClose);
      this.notifyTabsChanged();
      return;
    }

    // Remove view from window and close webContents
    this.options.mainWindow.contentView.removeChildView(tabToClose.view);
    tabToClose.view.webContents.close();
    this.tabs.delete(targetId);

    // If closed the active tab, switch to adjacent tab
    if (this.activeTabId === targetId) {
      const remaining = Array.from(this.tabs.keys());
      const nextId = remaining[remaining.length - 1];
      this.switchTab(nextId);
    } else {
      this.notifyTabsChanged();
    }

    this.options.onTabClosed?.(targetId);
    this.options.onLog?.('info', `Closed tab [${targetId}]`);
  }

  public updateActiveTabBounds(): void {
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) return;
    const active = this.tabs.get(this.activeTabId)!;
    active.view.setBounds(
      this.viewportHidden
        ? { x: 0, y: 0, width: 0, height: 0 }
        : (this.options.getTabBounds?.(this.activeTabId) ?? this.options.getViewportBounds()),
    );
  }

  public setViewportVisibility(visible: boolean): void {
    this.viewportHidden = !visible;
    if (!this.activeTabId || !this.tabs.has(this.activeTabId)) return;
    const active = this.tabs.get(this.activeTabId)!;
    if (visible) {
      active.view.setBounds(this.options.getViewportBounds());
    } else {
      active.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  public getTabsSummary(): TabSummary[] {
    return Array.from(this.tabs.values()).map((t) => ({
      id: t.id,
      title: t.title || 'New Tab',
      url: t.url || 'about:blank',
      isLoading: t.isLoading,
      isActive: t.id === this.activeTabId,
    }));
  }

  private notifyTabsChanged(): void {
    this.options.onTabsChanged?.(this.getTabsSummary());
  }
}
