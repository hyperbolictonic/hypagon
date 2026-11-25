/**
 * Everything a tab's WebContents needs wired once: the stealth profile, the
 * browser-owned shortcuts, the context menu, the navigation/status listeners and
 * the diagnostics.
 *
 * Why a module: `createTab` was a 168-line method because every listener lived
 * inline. The wiring is the same for a fresh and a promoted (prerendered) view, and
 * it has no opinion about the tab registry.
 */
import type { HandlerDetails, WebContents, WindowOpenHandlerResponse } from 'electron';
import type { BrowserWindow } from 'electron';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import { applyHostProfile } from '../browser/stealth.js';
import { isTakeoverShortcut } from '../takeover-key.js';
import { attachContextMenu } from '../menu/context-menu.js';
import type { TabInstance, TabManagerOptions } from './tab-types.js';

/** When to use: `wireTab` — the app hooks and the manager's two callbacks. */
export interface TabWiringDeps {
  options: TabManagerOptions;
  /** Re-broadcast the tab strip after a status change. */
  notify: () => void;
  /** Open a link in a new Cyberdeck tab (the context menu's "open in new tab"). */
  openTab: (url: string) => void;
  /** Route `window.open()` for this WebContents. */
  wireWindowOpen: (wc: WebContents) => void;
}

/**
 * When to use: a WebContentsView has no default context menu, so every tab and
 * popup gets the browser's copy/paste/link/inspect menu wired once.
 */
export function attachTabContextMenu(wc: WebContents, window: BrowserWindow, deps: TabWiringDeps): void {
  if ((wc as any).__kuangContextMenu) return;
  (wc as any).__kuangContextMenu = true;
  attachContextMenu(wc, {
    window,
    onOpenLinkInNewTab: (url) => {
      try {
        deps.openTab(url);
      } catch (err) {
        // Worst case the link still opens via "open in system browser".
        deps.options.onLog?.('warn', `Could not open link in a new tab: ${(err as Error)?.message || err}`);
      }
    },
    onLog: (level, message) => deps.options.onLog?.(level, message),
  });
}

/**
 * When to use: `wireTab` — the human's browser shortcuts.
 *
 * Ctrl+= / Ctrl+- / Ctrl+0 are browser shortcuts, not page content (Electron does not
 * add Chrome's menu accelerators), and Ctrl+Shift+Space is the takeover toggle.
 */
function wireShortcuts(wc: WebContents, options: TabManagerOptions): void {
  wc.on('before-input-event', (event, input) => {
    if (isTakeoverShortcut(input, process.platform)) {
      event.preventDefault();
      options.onTakeoverShortcut?.();
      return;
    }
    if (input.key === '+' || input.key === '=') {
      event.preventDefault();
      options.onZoomShortcut?.('in');
    } else if (input.key === '-') {
      event.preventDefault();
      options.onZoomShortcut?.('out');
    } else if (input.key === '0') {
      event.preventDefault();
      options.onZoomShortcut?.('reset');
    }
  });
}

/** When to use: `wireTab` — navigation, title and load status into the tab model. */
function wireNavigation(wc: WebContents, tab: TabInstance, deps: TabWiringDeps): void {
  const { options, notify } = deps;

  wc.on('did-start-loading', () => {
    tab.isLoading = true;
    options.onTabUpdated?.(tab);
    notify();
  });

  wc.on('did-finish-load', () => {
    options.applyZoom?.(wc);
    tab.isLoading = false;
    const rawUrl = wc.getURL();
    if (rawUrl.includes('welcome.html')) {
      tab.url = 'mark-eleven://manual';
      tab.title = 'Kuang Grade // Manual';
    } else {
      tab.url = rawUrl;
      tab.title = wc.getTitle() || tab.url;
    }
    options.onLog?.('info', `[${tab.id}] Loaded: ${tab.title} (${tab.url})`);
    options.onTabUpdated?.(tab);
    notify();
  });

  wc.on('page-title-updated', (_, title) => {
    if (!wc.getURL().includes('welcome.html')) {
      tab.title = title;
      options.onTabUpdated?.(tab);
      notify();
    }
  });

  wc.on('did-fail-load', (_, errorCode, errorDescription, validatedURL) => {
    tab.isLoading = false;
    options.onLog?.('warn', `[${tab.id}] Barrier [${errorCode}]: ${errorDescription} (${validatedURL})`);
    options.onTabUpdated?.(tab);
    notify();
  });
}

/** When to use: `wireTab` — renderer crashes, hangs and console output. */
function wireDiagnostics(wc: WebContents, tab: TabInstance, deps: TabWiringDeps): void {
  const { options } = deps;

  wc.on('render-process-gone', (_event, details) => {
    options.onLog?.('warn', `[${tab.id}] Renderer gone (${details.reason}, exit ${details.exitCode})`);
    options.onRendererGone?.(tab, details);
  });

  wc.on('unresponsive', () => {
    options.onLog?.('warn', `[${tab.id}] Renderer unresponsive: ${tab.url || 'unknown URL'}`);
  });

  wc.on('console-message', (event: any, ...legacyArgs: any[]) => {
    const level = typeof event?.level === 'number' ? event.level : (legacyArgs[0] ?? 0);
    const message = event?.message ?? legacyArgs[1] ?? String(event ?? '');
    const line = event?.lineNumber ?? legacyArgs[2] ?? 0;
    const sourceId = event?.sourceId ?? legacyArgs[3] ?? '';
    const levelStr = level === 0 ? 'info' : level === 1 ? 'warn' : 'error';
    options.onConsoleLog?.({ level: levelStr, message, line, sourceId, timestamp: Date.now() });
  });
}

/** When to use: `createTab` — wire one tab view (fresh or promoted) in one call. */
export function wireTab(wc: WebContents, tab: TabInstance, deps: TabWiringDeps): void {
  const { options } = deps;

  // Page zoom is an app-level policy (fit to the display scale, or Windows scale).
  // Chromium persists zoom per origin, so re-assert it whenever a new document starts.
  options.applyZoom?.(wc);
  wc.on('did-navigate', () => options.applyZoom?.(wc));

  wireShortcuts(wc, options);
  attachTabContextMenu(wc, options.mainWindow, deps);

  // Also covers reused views (e.g. a prerendered view promoted to a tab), where the
  // view's webPreferences are not re-applied.
  try {
    wc.setBackgroundThrottling(false);
  } catch {
    // A destroyed view has nothing to throttle.
  }

  // Present as the host browser: UA plus the client hints that go with it.
  applyHostProfile(wc, options.hostProfile);

  // Auto-spawn new tabs for target="_blank" and window.open
  deps.wireWindowOpen(wc);

  wireNavigation(wc, tab, deps);
  wireDiagnostics(wc, tab, deps);
}

/** Re-exported so the popup router can type its return value without the SDK. */
export type { HandlerDetails, WindowOpenHandlerResponse };
