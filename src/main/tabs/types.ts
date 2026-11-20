/**
 * The tab surface: one tab's record and the callbacks a host supplies.
 *
 * Kept apart from the manager so a caller can type a tab (or the options object)
 * without importing Electron view creation.
 *
 * When to use: constructing a TabManager, or reading a tab from it.
 */
import type { BrowserWindow, WebContents, WebContentsView, RenderProcessGoneDetails } from 'electron';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import type { TabSummary } from '../../shared/types.js';

/** When to use: addressing one tab and its view/webContents. */
export interface TabInstance {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  view: WebContentsView;
  createdAt: number;
}

/** When to use: constructing the tab manager (window, callbacks, zoom). */
export interface TabManagerOptions {
  mainWindow: BrowserWindow;
  hostProfile: HostBrowserProfile;
  getViewportBounds: () => { x: number; y: number; width: number; height: number };
  /** Bounds for one tab, so a responsive/emulated view can be letterboxed. */
  getTabBounds?: (tabId: string) => { x: number; y: number; width: number; height: number };
  onTabUpdated?: (tab: TabInstance) => void;
  onTabsChanged?: (tabs: TabSummary[]) => void;
  onTabCreated?: (tab: TabInstance) => void;
  onTabClosed?: (tabId: string) => void;
  /** Called after a tab's native view is attached, so an overlay can stay on top. */
  onViewAdded?: () => void;
  onLog?: (level: 'info' | 'warn' | 'action', message: string) => void;
  onConsoleLog?: (log: { level: string; message: string; line: number; sourceId: string; timestamp: number }) => void;
  /** Re-apply the current page zoom after creation, navigation and tab switches. */
  applyZoom?: (wc: WebContents) => void;
  /** Ctrl+= / Ctrl+- / Ctrl+0, owned by the browser rather than the page. */
  onZoomShortcut?: (action: 'in' | 'out' | 'reset') => void;
  /** Ctrl+Shift+Space: explicit human takeover / hand-back. */
  onTakeoverShortcut?: () => void;
  /** A tab renderer disappeared; the owner decides whether to reload it. */
  onRendererGone?: (tab: TabInstance, details: RenderProcessGoneDetails) => void;
}
