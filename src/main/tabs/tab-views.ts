/**
 * Creating a tab's native view and wiring everything that listens to it.
 *
 * The view carries the app's browsing policy: background throttling off (an automated
 * browser is routinely occluded, and Chromium would otherwise throttle timers to >=1s),
 * the host stealth profile's UA and client hints, app-level zoom, the browser's own zoom
 * and takeover shortcuts, the right-click menu, and popup routing.
 *
 * When to use: `TabManager.createTab` — the manager owns the tab map and activation; this
 * owns the view and its event surface.
 */
import { WebContentsView, type BrowserWindow, type WebContents, type RenderProcessGoneDetails } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { attachContextMenu } from '../menu/context-menu.js';
import { isHumanTakeoverShortcut } from '../input/takeover-shortcut.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import type { TabInstance } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** When to use: constructing the view factory from the tab manager's own hooks. */
export interface TabViewsOptions {
  readonly mainWindow: BrowserWindow;
  readonly hostProfile: HostBrowserProfile;
  readonly onViewAdded?: () => void;
  readonly onTabCreated?: (tab: TabInstance) => void;
  readonly onTabUpdated?: (tab: TabInstance) => void;
  readonly onTabsChanged: () => void;
  readonly onConsoleLog?: (log: { level: string; message: string; line: number; sourceId: string; timestamp: number }) => void;
  readonly onRendererGone?: (tab: TabInstance, details: RenderProcessGoneDetails) => void;
  readonly applyZoom?: (wc: WebContents) => void;
  readonly onZoomShortcut?: (action: 'in' | 'out' | 'reset') => void;
  readonly onTakeoverShortcut?: () => void;
  readonly onLog?: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Open a link from the right-click menu in a new tab. */
  readonly openLinkInNewTab: (url: string) => void;
  /** Route `window.open` / `target="_blank"` (the popup policy). */
  readonly wireWindowOpen: (wc: WebContents) => void;
}

/** When to use: `TabManager` — one factory per manager. */
export class TabViews {
  private readonly options: TabViewsOptions;

  constructor(options: TabViewsOptions) {
    this.options = options;
  }

  /** When to use: the manual shown in a fresh tab and when the last tab is "closed". */
  welcomePagePath(): string {
    const candidates = [
      path.join(__dirname, '../../public/welcome.html'),
      path.join(__dirname, '../../dist/welcome.html'),
      path.join(__dirname, '../../../public/welcome.html'),
      path.join(__dirname, '../../../dist/welcome.html'),
      path.join(process.cwd(), 'public/welcome.html'),
      path.join(process.cwd(), 'dist/welcome.html'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[0];
  }

  /**
   * When to use: `TabManager.createTab` — builds the view (or adopts a prerendered one),
   * applies the browsing policy and returns the tab record with its listeners attached.
   * Navigation is the caller's job, so the tab is in the map before it loads.
   */
  create(id: string, initialUrl: string, existingView?: WebContentsView): TabInstance {
    const view = existingView || new WebContentsView({
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

    // Soft matte light zinc gray (#f4f4f5): prevents harsh white glare while making black typography 100% legible
    view.setBackgroundColor('#f4f4f5');
    this.options.mainWindow.contentView.addChildView(view);
    this.options.onViewAdded?.();

    const wc = view.webContents;

    // Page zoom is an app-level policy (fit to the display scale, or Windows
    // scale). Chromium persists zoom per origin, so re-assert it whenever a new
    // document starts; otherwise a site that was last opened at 100% snaps back.
    this.options.applyZoom?.(wc);
    wc.on('did-navigate', () => this.options.applyZoom?.(wc));

    // Ctrl+= / Ctrl+- / Ctrl+0 are browser shortcuts, not page content. Without
    // this the app has no zoom path for a human, because Electron does not add
    // Chrome's default menu accelerators.
    wc.on('before-input-event', (event, input) => {
      if (isHumanTakeoverShortcut(input)) {
        event.preventDefault();
        this.options.onTakeoverShortcut?.();
        return;
      }
      if (input.type !== 'keyDown' || input.alt) return;
      const mod = process.platform === 'darwin' ? input.meta : input.control;
      if (!mod) return;
      if (input.key === '+' || input.key === '=') {
        event.preventDefault();
        this.options.onZoomShortcut?.('in');
      } else if (input.key === '-') {
        event.preventDefault();
        this.options.onZoomShortcut?.('out');
      } else if (input.key === '0') {
        event.preventDefault();
        this.options.onZoomShortcut?.('reset');
      }
    });

    // Right-click: copy/paste/select-all, link and image actions, reload, inspect element.
    // A WebContentsView has no default context menu, so without this the browser is unusable
    // by hand even though every action exists in the API.
    if (!(wc as any).__kuangContextMenu) {
      (wc as any).__kuangContextMenu = true;
      attachContextMenu(wc, {
        window: this.options.mainWindow,
        onOpenLinkInNewTab: (url) => this.options.openLinkInNewTab(url),
        onLog: (level, message) => this.options.onLog?.(level, message),
      });
    }

    // Also covers reused views (e.g. a prerendered view promoted to a tab), where the
    // webPreferences above are not re-applied.
    try { wc.setBackgroundThrottling(false); } catch {}

    // Apply Host Browser Stealth Profile
    wc.setUserAgent(this.options.hostProfile.userAgent);
    wc.session.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['User-Agent'] = this.options.hostProfile.userAgent;
      details.requestHeaders['sec-ch-ua'] = this.options.hostProfile.secChUa;
      details.requestHeaders['sec-ch-ua-mobile'] = '?0';
      details.requestHeaders['sec-ch-ua-platform'] = this.options.hostProfile.secChUaPlatform;
      callback({ requestHeaders: details.requestHeaders });
    });

    // Auto-spawn new tabs for target="_blank" and window.open
    this.options.wireWindowOpen(wc);

    const tab: TabInstance = {
      id,
      title: 'New Tab',
      url: initialUrl,
      isLoading: false,
      view,
      createdAt: Date.now(),
    };

    this.options.onTabCreated?.(tab);

    // Navigation and status listeners
    wc.on('did-start-loading', () => {
      tab.isLoading = true;
      this.options.onTabUpdated?.(tab);
      this.options.onTabsChanged();
    });

    wc.on('did-finish-load', () => {
      this.options.applyZoom?.(wc);
      tab.isLoading = false;
      const rawUrl = wc.getURL();
      if (rawUrl.includes('welcome.html')) {
        tab.url = 'mark-eleven://manual';
        tab.title = 'Kuang Grade // Manual';
      } else {
        tab.url = rawUrl;
        tab.title = wc.getTitle() || tab.url;
      }
      this.options.onLog?.('info', `[${tab.id}] Loaded: ${tab.title} (${tab.url})`);
      this.options.onTabUpdated?.(tab);
      this.options.onTabsChanged();
    });

    wc.on('page-title-updated', (_, title) => {
      if (!wc.getURL().includes('welcome.html')) {
        tab.title = title;
        this.options.onTabUpdated?.(tab);
        this.options.onTabsChanged();
      }
    });

    wc.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
      tab.isLoading = false;
      this.options.onLog?.('warn', `[${tab.id}] Barrier [${errorCode}]: ${errorDescription} (${validatedURL})`);
      this.options.onTabUpdated?.(tab);
      this.options.onTabsChanged();
    });

    wc.on('render-process-gone', (_event, details) => {
      this.options.onLog?.('warn', `[${tab.id}] Renderer gone (${details.reason}, exit ${details.exitCode})`);
      this.options.onRendererGone?.(tab, details);
    });

    wc.on('unresponsive', () => {
      this.options.onLog?.('warn', `[${tab.id}] Renderer unresponsive: ${tab.url || 'unknown URL'}`);
    });

    wc.on('console-message', (event: any, ...legacyArgs: any[]) => {
      const level = typeof event?.level === 'number' ? event.level : (legacyArgs[0] ?? 0);
      const message = event?.message ?? legacyArgs[1] ?? String(event ?? '');
      const line = event?.lineNumber ?? legacyArgs[2] ?? 0;
      const sourceId = event?.sourceId ?? legacyArgs[3] ?? '';
      const levelStr = level === 0 ? 'info' : level === 1 ? 'warn' : 'error';

      this.options.onConsoleLog?.({
        level: levelStr,
        message,
        line,
        sourceId,
        timestamp: Date.now(),
      });
    });

    return tab;
  }
}
