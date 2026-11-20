/**
 * Popup windows for sign-in and `target="_blank"` requests.
 *
 * Plain links stay inside the Cyberdeck tab bar. A sign-in popup or form POST becomes a
 * real child window instead: it needs `window.opener` so the provider's `postMessage`
 * reaches the page that started the flow, and so the provider's `window.close()` closes
 * the popup and returns to the browsing tab.
 *
 * When to use: `TabManager` — it owns the tab map; this owns the window-open policy and
 * the child window's own wiring.
 */
import { BrowserWindow, type HandlerDetails, type WebContents, type WindowOpenHandlerResponse } from 'electron';
import { attachContextMenu } from '../menu/context-menu.js';
import { isPopupWindowRequest, popupWindowSize } from './window-open-policy.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';

/** When to use: constructing the popup handler from the tab manager's own hooks. */
export interface PopupWindowsOptions {
  readonly mainWindow: BrowserWindow;
  readonly hostProfile: HostBrowserProfile;
  readonly applyZoom?: (wc: WebContents) => void;
  readonly onLog?: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Open a URL in a Cyberdeck tab and focus it. */
  readonly openTab: (url: string) => void;
  /** The active tab's web contents, focused again when a popup closes. */
  readonly activeContents: () => WebContents | undefined;
}

/** When to use: the tab manager's `window.open` policy and child-window wiring. */
export class PopupWindows {
  /** Tabs/popups already have a window-open handler; reused WebContents must not stack them. */
  private readonly wired = new WeakSet<WebContents>();
  private readonly options: PopupWindowsOptions;

  constructor(options: PopupWindowsOptions) {
    this.options = options;
  }

  /** When to use: after creating or adopting a tab's web contents. */
  wire(wc: WebContents): void {
    if (this.wired.has(wc)) return;
    this.wired.add(wc);

    wc.setWindowOpenHandler((details) => this.request(details));
    // Electron creates the child window before this event fires. Wire the popup so it can open
    // nested popups, share the stealth UA/zoom policy, and hand focus back when it closes.
    wc.on('did-create-window', (popup) => this.configure(popup));
  }

  private request(details: HandlerDetails): WindowOpenHandlerResponse {
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
      this.options.openTab(details.url);
    } catch (err) {
      // The tab could not be created (window tearing down); do not let the click vanish silently.
      this.options.onLog?.('warn', `Could not open link in a new tab: ${(err as Error)?.message || err}`);
    }
    return { action: 'deny' };
  }

  private windowOptions(details: HandlerDetails): Electron.BrowserWindowConstructorOptions {
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

  private configure(popup: BrowserWindow): void {
    const wc = popup.webContents;

    try {
      popup.setMenuBarVisibility(false);
    } catch {
      // Window already gone or unsupported on this platform.
    }

    try {
      wc.setUserAgent(this.options.hostProfile.userAgent);
    } catch {
      // Best effort, same as the tab path.
    }

    this.options.applyZoom?.(wc);
    wc.on('did-navigate', () => this.options.applyZoom?.(wc));

    if (!(wc as any).__kuangContextMenu) {
      (wc as any).__kuangContextMenu = true;
      attachContextMenu(wc, {
        window: popup,
        onOpenLinkInNewTab: (url) => this.options.openTab(url),
        onLog: (level, message) => this.options.onLog?.(level, message),
      });
    }

    // The popup may itself call window.open() (nested provider hops).
    this.wire(wc);

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      this.options.onLog?.('warn', `Popup barrier [${errorCode}]: ${errorDescription} (${validatedURL})`);
    });

    popup.on('closed', () => {
      const mainWindow = this.options.mainWindow;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      this.options.onLog?.('info', 'Popup closed; returning focus to the browsing tab.');
      try {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        this.options.activeContents()?.focus();
      } catch {
        // The shell is tearing down.
      }
    });

    this.options.onLog?.('info', `Opened popup window (${wc.getURL() || 'pending navigation'})`);
  }
}
