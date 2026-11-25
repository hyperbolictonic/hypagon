/**
 * The renderer IPC surface.
 *
 * Every `ipcMain` handler the HUD uses is registered here: core state and
 * navigation, the human-control latch, tabs/zoom/viewport, the deck chrome,
 * Cortex bookmarks/history and the settings/decision panel. The chassis passes
 * its surfaces in explicitly; this module owns only the channel wiring.
 */
import { pageInfo, setViewportVisibility } from '../chassis/accessors.js';
import { clipboard, ipcMain, type WebContents } from 'electron';
import type { ChassisState, HarvestedConstruct, TabSummary } from '../../shared/types.js';
import type { DecisionEvent } from '../decide/decision-client.js';
import type { InputProfile } from '../telemetry/input-profile.js';
import { loadInputProfile, saveInputProfile } from '../telemetry/input-profile.js';
import type { LogEntry } from '../telemetry/telemetry-surface.js';
import type { NavigationSurface } from '../navigation/navigation-surface.js';
import type { ZoomController } from '../zoom/controller.js';
import type { ViewportController } from '../viewport/controller.js';
import type { DeckController } from '../deck/controller.js';
import type { ChassisHost } from '../chassis/host.js';
import { cortex } from '../cortex/cortex-db.js';
import {
  decisionStatus,
  readStoredDecisionConfig,
  runDecision,
  saveDecisionConfig,
} from '../decide/decision-client.js';

/** The surfaces the renderer IPC channels talk to. */
export interface IpcSurfaceDeps {
  state: ChassisState;
  hud: { touch(): void };
  logs(): LogEntry[];
  latestConstruct(): unknown;
  human: {
    takeOver(): void;
    resume(): void;
    status(): unknown;
  };
  nav: NavigationSurface;
  activeWebContents(): WebContents | null | undefined;
  tabs: {
    summary(): TabSummary[];
    create(url?: string): TabSummary;
    switchTo(id: string): void;
    close(id?: string): void;
  };
  zoom: ZoomController;
  viewport: ViewportController;
  deck: DeckController;
  toggleDevTools(): void;
  setViewportVisibility(visible: boolean): void;
  pageUrl(): string;
  send(channel: string, payload: unknown): void;
  inputSetProfile(profile: InputProfile): void;
  harvestMarkdown(): Promise<HarvestedConstruct>;
  decisionsLog(): DecisionEvent[];
}

/** Registers the renderer-facing IPC channels. */
export class IpcSurface {
  private readonly deps: IpcSurfaceDeps;

  constructor(deps: IpcSurfaceDeps) {
    this.deps = deps;
  }

  register(): void {
    this.registerCore();
    this.registerTabViewport();
    this.registerDeck();
    this.registerCortex();
    this.registerSettings();
  }

  private registerCore(): void {
    const deps = this.deps;
    ipcMain.on('chassis:hud-heartbeat', () => deps.hud.touch());
    ipcMain.handle('chassis:get-state', () => deps.state);
    ipcMain.handle('chassis:get-latest-construct', () => deps.latestConstruct());
    ipcMain.handle('chassis:get-logs', () => deps.logs());
    ipcMain.handle('chassis:take-over-human', () => deps.human.takeOver());
    ipcMain.handle('chassis:resume-human', () => deps.human.resume());
    ipcMain.handle('chassis:get-human-status', () => deps.human.status());

    ipcMain.handle('chassis:navigate', async (_, url: string) => {
      await deps.nav.navigateTo(url);
      return { success: true };
    });

    // Toolbar history controls. These are the same entry points the MCP `navigate_history` tool and
    // the right-click menu use, so a human and an agent cannot drift apart.
    ipcMain.handle('chassis:go-back', async () => ({ message: await deps.nav.goBack() }));
    ipcMain.handle('chassis:go-forward', async () => ({ message: await deps.nav.goForward() }));
    ipcMain.handle('chassis:reload', async () => ({ message: await deps.nav.reload() }));
    ipcMain.handle('chassis:get-nav-state', () => {
      const wc = deps.activeWebContents();
      const usable = wc && !wc.isDestroyed();
      return {
        canGoBack: usable ? wc.navigationHistory.canGoBack() : false,
        canGoForward: usable ? wc.navigationHistory.canGoForward() : false,
      };
    });

    // Human-input pacing (Settings → INPUT). IPC only: settings are never changed over HTTP.
    ipcMain.handle('input:get-profile', () => loadInputProfile());
    ipcMain.handle('input:save-profile', (_: any, patch: Partial<InputProfile>) => {
      const result = saveInputProfile(patch || {});
      if (result.ok) deps.inputSetProfile(result.profile);
      return result;
    });

    ipcMain.handle('chassis:harvest', async () => await deps.harvestMarkdown());
  }

  private registerTabViewport(): void {
    const deps = this.deps;
    ipcMain.handle('chassis:get-tabs', () => deps.tabs.summary());
    ipcMain.handle('chassis:create-tab', (_, url?: string) => deps.tabs.create(url));
    ipcMain.handle('chassis:switch-tab', (_, tabId: string) => deps.tabs.switchTo(tabId));
    ipcMain.handle('chassis:close-tab', (_, tabId?: string) => deps.tabs.close(tabId));

    // Page zoom: a runtime view control. The persisted mode is written from the
    // main process IPC handler (`chassis:zoom:mode`) so the bridge cannot change
    // a human setting by accident.
    ipcMain.handle('chassis:zoom:get', () => deps.zoom.getState());
    ipcMain.handle('chassis:zoom:set', (_, input: { action?: 'status' | 'in' | 'out' | 'reset'; factor?: number } = {}) =>
      deps.zoom.setZoom(input),
    );

    // Responsive device emulation. The agent path is intentionally tiny (status/set/reset);
    // profile management is a human-only convenience.
    ipcMain.handle('chassis:viewport:get', () => deps.viewport.state());
    ipcMain.handle('chassis:viewport:set', (_, input: Parameters<ViewportController['set']>[0] = {}) =>
      deps.viewport.set(input),
    );
    ipcMain.handle('chassis:viewport:reset', () => deps.viewport.reset());
    ipcMain.handle('viewport:profile:save', (_, input: { name?: unknown; spec?: unknown }) =>
      deps.viewport.saveProfile(input ?? {}),
    );
    ipcMain.handle('viewport:profile:delete', (_, id: unknown) => deps.viewport.deleteProfile(id));
    ipcMain.handle('chassis:devtools:open', () => deps.toggleDevTools());

    const setVisibility = (_: any, visible: boolean) => deps.setViewportVisibility(visible);
    ipcMain.handle('chassis:set-viewport-visibility', setVisibility);
    ipcMain.on('chassis:set-viewport-visibility', setVisibility);
  }

  private registerDeck(): void {
    const deck = this.deps.deck;
    ipcMain.handle('chassis:get-sidebar-mode', () => deck.getMode());
    ipcMain.handle('chassis:get-sidebar-state', () => deck.surfaceState());
    // TEMP instrumentation: live bounds for verifying collab-mode geometry.
    ipcMain.handle('chassis:get-sidebar-bounds', () => deck.getView()?.getBounds() ?? null);
    ipcMain.on('chassis:set-sidebar-mode', (_: any, mode: 'docked' | 'floating' | 'collapsed') => deck.setMode(mode));
    ipcMain.on('chassis:toggle-sidebar-mode', () => deck.toggleMode());

    // Orb drag choreography (only meaningful while collapsed).
    ipcMain.on('chassis:set-sidebar-orb-edge', (_: any, edge: 'left' | 'right') => deck.setOrbEdge(edge));
    // Live drag: forward pointer deltas, clamped inside the content area.
    ipcMain.on('chassis:orbit-drag', (_: any, delta: { dx: number; dy: number }) => deck.dragOrb(delta));
    ipcMain.on('chassis:orbit-drag-end', () => deck.endOrbDrag());

    // Collab mode: toolbar pill, note cycling, concise list.
    ipcMain.on('chassis:set-collab-mode', (_: any, open: boolean) => deck.setCollabMode(Boolean(open)));
    ipcMain.on('chassis:collab-escape', () => deck.exitCollabUi());
    ipcMain.on('chassis:collab-navigate', (_: any, delta: number) => deck.navigate(delta));
    ipcMain.on('chassis:collab-toggle-list', (_: any, anchor?: { x: number; y: number; width: number; height: number }) =>
      deck.toggleList(anchor),
    );
  }

  private registerCortex(): void {
    ipcMain.handle('cortex:recall', async (_, query: string, options?: any) => {
      return await cortex.recall(query, options);
    });
    ipcMain.handle('cortex:suggest-urls', async (_, query: string, options?: any) => {
      return await cortex.suggestUrls(String(query || ''), options || {});
    });
    ipcMain.handle('cortex:get-history', async (_, options?: any) => {
      return await cortex.getHistory(options);
    });
    ipcMain.handle('cortex:clear-history', async (_, olderThan?: string) => {
      await cortex.clearHistory(olderThan);
      return { success: true };
    });
    ipcMain.handle('cortex:add-bookmark', async (_, bookmark: any) => {
      return await cortex.addBookmark(bookmark);
    });
    ipcMain.handle('cortex:list-bookmarks', async (_, options?: any) => {
      return await cortex.listBookmarks(options);
    });
    ipcMain.handle('cortex:delete-bookmark', async (_, urlOrId: string) => {
      return await cortex.deleteBookmark(urlOrId);
    });
    ipcMain.handle('cortex:is-bookmarked', async (_, url: string) => {
      return await cortex.isBookmarked(url);
    });
  }

  private registerSettings(): void {
    const deps = this.deps;
    // Settings → decision model (optional). The renderer reads/writes data/decision.json through
    // these; the same file the bridge and the MCP server read, so there is one source of truth.
    ipcMain.handle('settings:get-decision', async () => ({
      stored: readStoredDecisionConfig(),
      status: decisionStatus(),
    }));
    ipcMain.handle('settings:save-decision', async (_, config: any) => {
      const result = await saveDecisionConfig(config);
      deps.send('chassis:decision-status', decisionStatus());
      return result;
    });
    ipcMain.handle('chassis:get-decisions', async () => deps.decisionsLog());
    // Reliable text copy for the HUD: selecting text inside a WebContentsView shell is not always
    // possible, and the clipboard is async in Electron 44.
    ipcMain.handle('app:copy-text', async (_, text: string) => {
      await clipboard.writeText(String(text ?? ''));
      return { ok: true };
    });
    ipcMain.handle('settings:test-decision', async () => {
      const started = Date.now();
      const result = await runDecision({
        state: { page: deps.pageUrl(), note: 'connectivity probe from the Settings tab' },
        questions: { reachable: { type: 'noul', instructions: 'Is this a page URL?' } },
      });
      return { ...result, totalMs: Date.now() - started };
    });
  }
}

/** When to use: the chassis boot — build the renderer IPC surface from the host contract. */
export function createIpcSurface(host: ChassisHost): IpcSurface {
  return new IpcSurface({
    state: host.state,
    hud: host.hud,
    logs: () => host.telemetry.entries(),
    latestConstruct: () => host.latestConstruct,
    human: {
      takeOver: () => host.human.takeOver(),
      resume: () => host.human.resume(),
      status: () => host.human.status(),
    },
    nav: host.nav,
    activeWebContents: () => host.tabSetup.manager?.getActiveTab()?.view?.webContents ?? null,
    tabs: {
      summary: () => host.tabSetup.manager?.getTabsSummary() ?? [],
      create: (url) => host.tabOps.create(url),
      switchTo: (id) => host.tabOps.switchTo(id),
      close: (id) => host.tabOps.close(id),
    },
    zoom: host.zoom,
    viewport: host.tabSetup.requireViewport(),
    deck: host.deck,
    toggleDevTools: () => host.tabOps.toggleDevTools(),
    setViewportVisibility: (visible) => setViewportVisibility(host, visible),
    pageUrl: () => pageInfo(host).url,
    send: (channel, payload) => host.bus.toSurfaces(channel, payload),
    inputSetProfile: (profile) => host.input.simulator.setProfile(profile),
    harvestMarkdown: () => host.harvest.harvestMarkdown(),
    decisionsLog: () => host.decision.events(),
  });
}
