/**
 * The tab manager: open tabs, the active one, their native views and their bounds.
 *
 * Why this file is small: the tab shapes are `tab-types.ts`, the collection and the
 * tab-strip summary are `tab-registry.ts`, the per-WebContents wiring (stealth
 * profile, shortcuts, context menu, navigation and diagnostics) is `tab-wiring.ts`,
 * the sign-in popup policy is `popup-windows.ts`, the bounds rule is
 * `tab-bounds.ts` and the welcome page is `welcome-page.ts`.
 *
 * This class wires them and owns the lifecycle: create, switch, close, relayout.
 */
import { WebContentsView } from 'electron';
import type { TabSummary } from '../../shared/types.js';
import { HIDDEN_BOUNDS, boundsFor } from './tab-bounds.js';
import { TabRegistry } from './tab-registry.js';
import type { TabInstance, TabManagerOptions } from './tab-types.js';
import { wireTab, type TabWiringDeps } from './tab-wiring.js';
import { PopupWindows } from './popup-windows.js';
import { welcomePagePath } from './welcome-page.js';

export type { TabInstance, TabManagerOptions } from './tab-types.js';

/** When to use: the window and the tab tools — create, switch, close and lay out the tab views. */
export class TabManager {
  private readonly options: TabManagerOptions;
  private counter = 0;

  /** The open tabs and which one is active. */
  readonly registry = new TabRegistry();
  /** The `window.open()` policy (plain links become tabs, sign-ins become child windows). */
  private readonly popups: PopupWindows;
  /** The hooks every tab and popup is wired with. */
  private readonly wiring: TabWiringDeps;
  /** Set while a full-window settings/dialog surface owns the UI. */
  private viewportHidden = false;

  constructor(options: TabManagerOptions) {
    this.options = options;
    this.wiring = {
      options,
      notify: () => this.notifyTabsChanged(),
      openTab: (url) => {
        this.createTab(url);
      },
      wireWindowOpen: (wc) => this.popups.wire(wc),
    };
    this.popups = new PopupWindows(options, {
      ...this.wiring,
      focusActiveTab: () => this.registry.get(this.registry.activeId)?.view.webContents.focus(),
    });
  }

  /** Create a tab (or adopt a prerendered view) and switch to it. */
  public createTab(initialUrl: string = 'about:blank', existingView?: WebContentsView): TabInstance {
    this.counter++;
    const id = `tab_${this.counter}`;

    const view =
      existingView ||
      new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          // An automated browser is routinely occluded (the human's editor/terminal owns the
          // foreground), and Chromium then reports the page as hidden and throttles its timers
          // to >=1s. That silently breaks lazy-loading harvests and 'infinite' feeds. Keep
          // browsing tabs running at full speed while we drive them.
          backgroundThrottling: false,
        },
      });

    // Soft matte light zinc gray (#f4f4f5): prevents harsh white glare while making black
    // typography 100% legible.
    view.setBackgroundColor('#f4f4f5');
    this.options.mainWindow.contentView.addChildView(view);
    this.options.onViewAdded?.();

    const wc = view.webContents;
    const tab: TabInstance = {
      id,
      title: 'New Tab',
      url: initialUrl,
      isLoading: false,
      view,
      createdAt: Date.now(),
    };

    this.options.onTabCreated?.(tab);
    wireTab(wc, tab, this.wiring);

    this.registry.tabs.set(id, tab);

    // If the view was already prerendered, it is already loaded.
    if (existingView) {
      tab.title = wc.getTitle() || 'Prerendered Page';
      tab.isLoading = false;
      this.options.onTabUpdated?.(tab);
      this.notifyTabsChanged();
    } else if (initialUrl && initialUrl !== 'about:blank' && initialUrl !== 'mark-eleven://manual') {
      const formatted =
        initialUrl.startsWith('http://') || initialUrl.startsWith('https://') ? initialUrl : `https://${initialUrl}`;
      wc.loadURL(formatted);
    } else {
      wc.loadFile(welcomePagePath());
    }

    this.switchTab(id);
    return tab;
  }

  /** Bring a tab to the front and give it the viewport. */
  public switchTab(tabId: string): void {
    if (!this.registry.tabs.has(tabId)) {
      throw new Error(`Tab ${tabId} does not exist`);
    }

    // Hide the previous active tab's view by tucking its bounds away.
    if (this.registry.activeId && this.registry.tabs.has(this.registry.activeId) && this.registry.activeId !== tabId) {
      const previous = this.registry.tabs.get(this.registry.activeId)!;
      previous.view.setBounds(HIDDEN_BOUNDS);
    }

    this.registry.activeId = tabId;
    const current = this.registry.tabs.get(tabId)!;
    this.options.applyZoom?.(current.view.webContents);
    current.view.setBounds(boundsFor(this.options, tabId, this.viewportHidden));

    this.options.onLog?.('info', `Switched active browsing node to [${current.id}] "${current.title}"`);
    this.options.onTabUpdated?.(current);
    this.notifyTabsChanged();
  }

  /** Close a tab; the last one is reset to the manual instead of closing the window. */
  public closeTab(tabId?: string): void {
    const targetId = tabId || this.registry.activeId;
    if (!this.registry.tabs.has(targetId)) return;

    const tabToClose = this.registry.tabs.get(targetId)!;

    // If only 1 tab remains, reset it to the manual rather than closing the window.
    if (this.registry.tabs.size <= 1) {
      tabToClose.view.webContents.loadFile(welcomePagePath());
      tabToClose.title = 'Kuang Grade // Manual';
      tabToClose.url = 'mark-eleven://manual';
      this.options.onTabUpdated?.(tabToClose);
      this.notifyTabsChanged();
      return;
    }

    // Remove the view from the window and close the WebContents.
    this.options.mainWindow.contentView.removeChildView(tabToClose.view);
    tabToClose.view.webContents.close();
    this.registry.tabs.delete(targetId);

    // If the closed tab was active, switch to the adjacent one.
    if (this.registry.activeId === targetId) {
      const remaining = Array.from(this.registry.tabs.keys());
      this.switchTab(remaining[remaining.length - 1]);
    } else {
      this.notifyTabsChanged();
    }

    this.options.onTabClosed?.(targetId);
    this.options.onLog?.('info', `Closed tab [${targetId}]`);
  }

  /** Re-fit the active tab after a mode change, resize or viewport recovery. */
  public updateActiveTabBounds(): void {
    const active = this.registry.activeOrUndefined();
    if (!active) return;
    active.view.setBounds(boundsFor(this.options, active.id, this.viewportHidden));
  }

  /** Hide the tab views behind a settings surface, or bring them back. */
  public setViewportVisibility(visible: boolean): void {
    this.viewportHidden = !visible;
    const active = this.registry.activeOrUndefined();
    if (!active) return;
    active.view.setBounds(visible ? this.options.getViewportBounds() : HIDDEN_BOUNDS);
  }

  /** The tab strip's view of the open tabs. */
  public getTabsSummary(): TabSummary[] {
    return this.registry.summary();
  }

  private notifyTabsChanged(): void {
    this.options.onTabsChanged?.(this.registry.summary());
  }
}
