/**
 * The tab shapes: one live tab and the options the manager is built with.
 *
 * Why a module: the manager, the registry, the popup router and the event wiring
 * all describe the same tab, and they must not import each other to do it.
 */
import type {
  BrowserWindow,
  RenderProcessGoneDetails,
  WebContents,
  WebContentsView,
} from 'electron';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import type { TabSummary } from '../../shared/types.js';

/** When to use: anywhere a tab is passed around (manager, registry, events). */
export interface TabInstance {
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  view: WebContentsView;
  createdAt: number;
}

/** When to use: `new TabManager(...)` — the host window and the app's hooks. */
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
