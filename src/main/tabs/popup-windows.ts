/**
 * The sign-in / popup window policy: which `window.open()` requests become a real
 * child window, how that window is built, and how it hands focus back.
 *
 * Why a module: four methods and ~100 lines of Electron window options that have
 * nothing to do with the tab registry. A plain link stays a tab; a sign-in popup
 * needs `window.opener` for the provider's `postMessage` and `window.close()`.
 */
import { type BrowserWindow, type BrowserWindowConstructorOptions, type WebContents, type WindowOpenHandlerResponse } from 'electron';
import { isPopupWindowRequest, popupWindowSize } from './window-open-policy.js';
import { attachTabContextMenu, type TabWiringDeps } from './tab-wiring.js';
import type { TabManagerOptions } from './tab-types.js';

/** The wiring hooks plus the one callback only popups need. */
export type PopupWiringDeps = TabWiringDeps & { focusActiveTab: () => void };

/** When to use: `TabManager` — one popup router per window. */
export class PopupWindows {
  private readonly options: TabManagerOptions;
  private readonly deps: PopupWiringDeps;
  /** Tabs/popups already have a window-open handler; reused WebContents must not stack them. */
  private readonly wired = new WeakSet<WebContents>();

  constructor(options: TabManagerOptions, deps: PopupWiringDeps) {
    this.options = options;
    this.deps = deps;
  }

  /**
   * Route `window.open()` / `target="_blank"` requests for one WebContents, and wire the
   * child windows Electron creates for them.
   */
  wire(wc: WebContents): void {
    if (this.wired.has(wc)) return;
    this.wired.add(wc);

    wc.setWindowOpenHandler((details) => this.request(details));
    // Electron creates the child window before this event fires. Wire the popup so it can open
    // nested popups, share the stealth UA/zoom policy, and hand focus back when it closes.
    wc.on('did-create-window', (popup) => this.configure(popup));
  }

  /** Allow a sign-in popup as a real child window; turn any other request into a tab. */
  private request(details: Parameters<Parameters<WebContents['setWindowOpenHandler']>[0]>[0]): WindowOpenHandlerResponse {
    if (isPopupWindowRequest(details)) {
      this.options.onLog?.('action', `Sign-in/popup link: opening a child window -> ${details.url}`);
      return {
        action: 'allow',
        // A human can close the originating tab while the provider is still mid-flow. Keeping
        // the popup alive lets them finish (or read the error) instead of losing the window.
        outlivesOpener: true,
        overrideBrowserWindowOptions: this.windowOptions(details),
      };
    }

    this.options.onLog?.('action', `Intercepted popup/external link: opening new Cyberdeck tab -> ${details.url}`);
    try {
      this.deps.openTab(details.url);
    } catch (err) {
      // The tab could not be created (window tearing down); do not let the click vanish silently.
      this.options.onLog?.('warn', `Could not open link in a new tab: ${(err as Error)?.message || err}`);
    }
    return { action: 'deny' };
  }

  /** The child window's shape: owned by the browser window, never modal. */
  private windowOptions(details: Parameters<Parameters<WebContents['setWindowOpenHandler']>[0]>[0]): BrowserWindowConstructorOptions {
    const { width, height } = popupWindowSize(details.features);
    return {
      // Owned by the browser window: it stays above the tab strip without blocking it.
      parent: this.options.mainWindow,
      modal: false,
      show: true,
      width,
      height,
      minWidth: 320,
      minHeight: 320,
      autoHideMenuBar: true,
      backgroundColor: '#f4f4f5',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        // A sign-in popup is often occluded by the tab the human is watching; keep its
        // timers and redirects running at full speed.
        backgroundThrottling: false,
      },
    };
  }

  /** A popup the provider opened: same menu, stealth UA, zoom policy and nested popups. */
  private configure(popup: BrowserWindow): void {
    const wc = popup.webContents;
    const { options } = this;

    try {
      popup.setMenuBarVisibility(false);
    } catch {
      // Window already gone or unsupported on this platform.
    }

    try {
      wc.setUserAgent(options.hostProfile.userAgent);
    } catch {
      // Best effort, same as the tab path.
    }

    options.applyZoom?.(wc);
    wc.on('did-navigate', () => options.applyZoom?.(wc));

    attachTabContextMenu(wc, popup, this.deps);

    // The popup may itself call window.open() (nested provider hops).
    this.wire(wc);

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      options.onLog?.('warn', `Popup barrier [${errorCode}]: ${errorDescription} (${validatedURL})`);
    });

    popup.on('closed', () => {
      const mainWindow = options.mainWindow;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      options.onLog?.('info', 'Popup closed; returning focus to the browsing tab.');
      try {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        this.deps.focusActiveTab();
      } catch {
        // The shell is tearing down.
      }
    });

    options.onLog?.('info', `Opened popup window (${wc.getURL() || 'pending navigation'})`);
  }
}
