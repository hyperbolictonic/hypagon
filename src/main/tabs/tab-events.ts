/**
 * Tab lifecycle handlers.
 *
 * The tab manager emits renderer-gone, navigation, tab-list, tab-created and
 * console events. Reacting to them touches chassis state, the network tap, the
 * Shadow Walk patch, the harvest index, the tray and the HUD; this factory keeps
 * that reaction set in one place with explicit dependencies.
 */
import type { TabManager, TabInstance } from './tab-manager.js';
import type { ChassisState, TabSummary } from '../../shared/types.js';
import type { HumanActivity } from '../input/human-activity.js';

/** One page console line. */
export interface ConsoleLine {
  level: string;
  message: string;
  line: number;
  sourceId: string;
  timestamp: number;
}

/** The chassis callbacks the tab handlers read and write. */
export interface TabEventDeps {
  state: ChassisState;
  activeTabId(): string | undefined;
  allTabs(): TabInstance[];
  broadcastState(): void;
  bumpRevision(): void;
  reassertViewport(): void;
  send(channel: string, payload: unknown): void;
  updateTray(pending: boolean): void;
  hilPending(): boolean;
  attachNetwork(wc: TabInstance['view']['webContents']): void;
  registerViewportTab(tab: TabInstance): void;
  syncForceOpen(wc: TabInstance['view']['webContents']): Promise<{ changed: boolean; armed: boolean }>;
  indexTab(tab: TabInstance): void;
  ingestHuman(message: string): HumanActivity | null;
  noteHuman(activity: HumanActivity): void;
  recordConsole(line: ConsoleLine): void;
  collaborationSignal(message: string): void;
  logEvent(name: string, detail?: Record<string, unknown>): void;
  humanListenerScript(): string;
}

/** The handlers a `TabManager` installs. */
export interface TabEventHandlers {
  onRendererGone(tab: TabInstance, details: Electron.RenderProcessGoneDetails): void;
  onTabUpdated(tab: TabInstance): void;
  onTabsChanged(tabs: TabSummary[]): void;
  onTabCreated(tab: TabInstance): void;
  onConsoleLog(log: ConsoleLine): void;
}

/** When to use: building the tab manager — the reaction set for its events. */
export function createTabEventHandlers(deps: TabEventDeps): TabEventHandlers {
  /** A loaded, real-URL tab is ready for background work (listener re-arm, quiet indexing). */
  const readyForBackgroundWork = (tab: { isLoading: boolean; url?: string }): boolean =>
    !tab.isLoading && Boolean(tab.url) && !tab.url!.startsWith('mark-eleven:') && tab.url !== 'about:blank';

  return {
    onRendererGone(tab, details) {
      deps.logEvent('tab-renderer-gone', {
        tabId: tab.id,
        url: tab.url,
        reason: details.reason,
        exitCode: details.exitCode,
      });
      if (details.reason === 'clean-exit') return;
      setTimeout(() => {
        const live = deps.allTabs().find((candidate) => candidate.id === tab.id);
        if (!live || live.view.webContents.isDestroyed()) return;
        try {
          live.view.webContents.reload();
        } catch {
          // The tab was closed while the renderer was restarting.
        }
        deps.reassertViewport();
      }, 600);
    },

    onTabUpdated(tab) {
      if (tab.id !== deps.activeTabId()) return;
      deps.state.currentUrl = tab.url;
      deps.state.pageTitle = tab.title;
      deps.state.isLoading = tab.isLoading;
      deps.state.activeTabId = tab.id;
      deps.broadcastState();

      if (!tab.isLoading) deps.bumpRevision();

      // Re-arm the takeover listener after every document (listeners die with the page).
      if (readyForBackgroundWork(tab)) {
        void tab.view.webContents.executeJavaScript(deps.humanListenerScript()).catch(() => null);
      }
      if (readyForBackgroundWork(tab)) {
        deps.indexTab(tab);
      }
    },

    onTabsChanged(tabs) {
      deps.state.tabs = tabs;
      deps.broadcastState();
      deps.updateTray(deps.hilPending());
      deps.send('chassis:tabs-updated', tabs);
    },

    onTabCreated(tab) {
      deps.attachNetwork(tab.view.webContents);
      deps.registerViewportTab(tab);
      // A tab created while force-open is armed must be patched *before* its document runs.
      // onTabCreated fires before the first load, but CDP arming is async; if the first document
      // already started, reload once so the patch is actually present.
      void deps.syncForceOpen(tab.view.webContents).then((result) => {
        if (result.changed && result.armed && !tab.view.webContents.isDestroyed()) {
          setTimeout(() => {
            try {
              tab.view.webContents.reload();
            } catch {}
          }, 60);
        }
      });
    },

    onConsoleLog(log) {
      deps.recordConsole(log);
      // Takeover channel: the page reports trusted pointer/key/wheel activity with a magic prefix.
      const human = deps.ingestHuman(log.message);
      if (human) deps.noteHuman(human);
      deps.collaborationSignal(log.message);
    },
  };
}
