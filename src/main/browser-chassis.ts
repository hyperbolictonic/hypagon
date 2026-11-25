import path from 'node:path';
import { BrowserWindow, app, screen, session, type WebContents } from 'electron';
import type { AgentStatus, ChassisState, HarvestedConstruct, TelemetryEvent, TabSummary } from '../shared/types.js';

import { ViewportController } from './viewport/controller.js';
import { ZoomController } from './zoom/controller.js';
import { InputSurface } from './input/input-surface.js';
import { TelemetrySurface } from './telemetry/telemetry-surface.js';
import { humanListenerScript } from './input/human-activity.js';
import { HumanControlSurface } from './input/human-control.js';
import { NavigationSurface } from './navigation/navigation-surface.js';
import { CollaborationSurface } from './collaboration/surface.js';
import { ActionLedger } from './telemetry/action-ledger.js';
import { ConstructHarvester } from './harvester/markdown.js';
import { JevController } from './jev/controller.js';
import { DeckController } from './deck/controller.js';
import { HarvestSurface } from './harvest/harvest-surface.js';

import { DecisionSurface } from './decide/decision-surface.js';
import { captureScreenshotJpeg } from './capture/screenshot-jpeg.js';
import { detectHostBrowserProfile, type HostBrowserProfile } from './telemetry/host-fingerprint.js';
import { cortex } from './cortex/cortex-db.js';
import { DownloadSurface } from './downloads/download-surface.js';
import { ShieldBreaker, type ConsentPolicy } from './shield/shield-breaker.js';
import { ConsentController } from './shield/consent-controller.js';
import { resolveFrameMark } from './browser/frame-marks.js';
import { resolveSealedToken as resolveSealedTarget } from './shadow-walk/sealed-targets.js';
import { loadShadowWalkSettings } from './shadow-walk/settings.js';
import { assertShadowSurface } from './shadow-walk/guard.js';
import { ShadowWalkSurface } from './shadow-walk/shadow-surface.js';
import { PageScriptSurface } from './browser/page-script-surface.js';
import { dataPath } from './data-paths.js';
import { logMainEvent } from './diagnostics/main-log.js';
import { SessionSurface } from './session/session-surface.js';
import { NetworkSurface } from './network/network-surface.js';
import { MarksOverlay } from './marks/marks-overlay.js';
import { MarksSurface } from './marks/marks-surface.js';
import { Primitives } from './primitives/primitives.js';
import { ScriptsSurface } from './scripts/scripts-surface.js';
import { TrayManager } from './tray/tray-manager.js';
import { WindowSurface } from './window/window-surface.js';
import { researchError } from './research/session-controller.js';
import { ResearchViewSurface } from './research/research-view-surface.js';
import { ResearchSessionSurface } from './research/research-session-surface.js';
import { CrawlSurface } from './research/crawl-surface.js';

import { HilSurface } from './hil/hil-surface.js';
import { queryJsonData, type JsonQueryParams } from './utils/json-query.js';
import type { JsonQueryResult } from './utils/json-navigator.js';
import { ConsoleLogBuffer } from './diagnostics/console-log.js';
import { PrerenderEngine, type PrerenderOptions } from './prerender/prerender-engine.js';
import { isTakeoverShortcut } from './takeover-key.js';
import { HudWatchdog } from './boot/hud-watchdog.js';
import { WindowBootSurface } from './boot/window-boot.js';
import type { DownloadNotice } from './boot/window-boot.js';
import { ShellBus } from './shell/event-bus.js';
import { createLlmStack } from './chassis/llm-stack.js';
import {
  createChromeSurfaces,
  createConsentController,
  createJevController,
  createPageScriptSurface,
  createResearchViewSurface,
  createShadowWalkSurface,
  createTabEvents,
  createWindowBoot,
} from './chassis/surfaces.js';
import { createInputStack } from './chassis/input-stack.js';
import { createHarvestNavStack } from './chassis/harvest-nav-stack.js';
import { createInteractionStack } from './chassis/interaction-stack.js';
import { createIpcSurface, type IpcSurface } from './ipc/ipc-surface.js';
import { readPageInfo } from './tabs/page-info.js';
import { TabManager } from './tabs/tab-manager.js';
import { TabSurface } from './tabs/tab-surface.js';
import { createTabEventHandlers } from './tabs/tab-events.js';
import { activeWebContents, bumpRevision, pageInfo } from './chassis/accessors.js';
import { startLoops } from './boot/start-loops.js';

import { TabSetupSurface } from './tabs/tab-setup.js';
import { LlmSurface } from './llm/llm-surface.js';
import { ReadSurface } from './llm/read-surface.js';
import { SearchSurface } from './search/search-surface.js';
import { SearchHub } from './search/search-engine.js';


export class BrowserChassis {
  private mainWindow: BrowserWindow | null = null;
  /** Window visibility, focus and close-to-tray behaviour. */
  readonly window = new WindowSurface({
    window: () => this.mainWindow,
    tray: () => this.trayManager,
  });
  /** The bound log entry point the composition roots may pass around without losing `this`. */
  readonly log = (level: 'info' | 'warn' | 'action', message: string): void => this.telemetry.addLog(level, message);
  /** Decision log and the guard-driven human hand-off. */
  readonly decision = new DecisionSurface({
    hil: () => this.hil,
    pageUrl: () => pageInfo(this).url,
  });
  /** Tab manager and viewport controller, built with the window. */
  readonly tabSetup!: TabSetupSurface;
  readonly input!: InputSurface;
  readonly harvester!: ConstructHarvester;
  /** JEV page compaction: surface index + in-memory depth store. */
  readonly shieldBreaker!: ShieldBreaker;
  readonly downloads!: DownloadSurface;
  readonly sessions!: SessionSurface;
  readonly network!: NetworkSurface;
  readonly marksOverlay!: MarksOverlay;
  readonly marks: MarksSurface;
  readonly harvest: HarvestSurface;
  readonly nav: NavigationSurface;
  readonly scripts!: ScriptsSurface;
  trayManager: TrayManager | null = null;
  /** Human-in-the-loop and desktop notifications. */
  readonly hil!: HilSurface;
  readonly prerenderEngine!: PrerenderEngine;
  readonly hostProfile: HostBrowserProfile = detectHostBrowserProfile();
  readonly primitives!: Primitives;
  private llmSurface!: LlmSurface;
  private researchLlmSurface!: LlmSurface;
  private searchHub!: SearchHub;
  /** The agent-facing read/search adapters; the transports stay private. */
  readonly llm: ReadSurface;
  readonly search: SearchSurface;
  /** Research session settings, cooldowns and the isolated session. */
  readonly research!: ResearchSessionSurface;
  /** Crawl, topic research and the research activity feed. */
  readonly crawl!: CrawlSurface;
  /** Shadow Walk policy, frame reads and the trusted Tab walk. */
  readonly shadow!: ShadowWalkSurface;
  /** Script evaluation and the shared control description. */
  readonly page!: PageScriptSurface;
  /** Shared detached research view and the citation/hand-off pipeline. */
  readonly researchView!: ResearchViewSurface;
  readonly actionLedger!: ActionLedger;


  /** Human takeover is explicit: page input alone never pauses the agent. */
  human!: HumanControlSurface;  /** True while a person has explicitly taken control from the HUD. */
  /** How to answer a consent wall. KUANG_CONSENT_POLICY=essential|accept|reject. */
  readonly consentPolicy: ConsentPolicy = (() => {
    const raw = String(process.env.HB_CONSENT_POLICY ?? process.env.KUANG_CONSENT_POLICY ?? '').toLowerCase();
    return raw === 'accept' || raw === 'reject' ? (raw as ConsentPolicy) : 'essential';
  })();
  /** Monotonic page revision: bumped on navigation and every mutating action. */
  revision = 0;
  /** The shell-window boot deps, kept out of the constructor. */
  /** The tab manager's lifecycle reactions. */  /** The tab manager's lifecycle reactions. */
  private tabEvents!: ReturnType<typeof createTabEventHandlers>;
  /** The shell-window boot sequence. */
  readonly boot!: WindowBootSurface;
  /** The page overlay picker and its signal channel. */
  collaboration!: CollaborationSurface;  /** Renderer IPC channels. */
  ipc!: IpcSurface;
  /** Open/switch/close and the DevTools toggle. */
  readonly tabOps!: TabSurface;
  /** The render fan-out for the shell and the deck. */
  readonly bus = new ShellBus({
    window: () => this.mainWindow,
    deckView: () => this.deck.panel.getView(),
  });
  /** HUD heartbeat and viewport-recovery watchdog. */
  hud!: HudWatchdog;

  readonly state: ChassisState = {
    currentUrl: 'about:blank',
    pageTitle: 'Hypagon Browser Offline',
    isLoading: false,
    agentStatus: 'IDLE',
    activeAction: 'Standby - Awaiting MCP Uplink',
    cursor: { x: 100, y: 100 },
    canGoBack: false,
    canGoForward: false,
    tabs: [],
    stats: {
      totalInteractions: 0,
      tokensHarvested: 0,
      avgLatencyMs: 42,
      uptimeSeconds: 0,
    },
  };

  /** Log ring, state broadcasts and telemetry; every controller reports through it. */
  readonly telemetry = new TelemetrySurface({
    state: this.state,
    send: (channel, payload) => this.bus.toSurfaces(channel, payload),
    zoomState: () => this.zoom.getState(),
    viewportState: () => this.tabSetup.viewport?.state(),
    activeWebContents: () => this.tabSetup.manager?.getActiveTab()?.view?.webContents ?? null,
  });

  latestConstruct: HarvestedConstruct | null = null;
  /** Captured page console lines (bounded). */
  readonly consoleLogs = new ConsoleLogBuffer();

  constructor() {
    const chrome = createChromeSurfaces(this);
    this.human = chrome.human;
    this.deck = chrome.deck;
    this.zoom = chrome.zoom;
    this.hud = chrome.hud;
    this.collaboration = chrome.collaboration;
    this.tabEvents = createTabEvents(this);
    this.decision.subscribe((event) => this.bus.toSurfaces('chassis:decision', event));
    this.tabSetup = new TabSetupSurface({
      window: () => this.mainWindow,
      hostProfile: this.hostProfile,
      deviceProfilesPath: () => path.join(app.getPath('userData'), 'device-profiles.json'),
      docked: () => this.deck.getMode() === 'docked',
      log: (level, message) => this.telemetry.addLog(level, message),
      broadcastState: () => this.telemetry.broadcastState(),
      positionDeck: () => this.deck.position(),
      bringDeckToFront: () => this.deck.panel.bringToFront(),
      applyZoomStep: (action) => this.zoom.setZoom({ action }),
      applyZoom: (wc) => this.zoom.applyTo(wc),
      setInputScale: (wc, scale) => this.input.simulator.setViewportScale(wc, scale),
      toggleHuman: () => this.human.toggle(),
      tabEvents: this.tabEvents,
    });
    this.boot = createWindowBoot(this);
    this.page = createPageScriptSurface(this);
    this.tabOps = new TabSurface({
      manager: () => this.tabSetup.requireManager(),
      activeWebContents: () => activeWebContents(this),
      log: (level, message) => this.telemetry.addLog(level, message),
      purgeJev: () => this.jev.purge(),
      scheduleConsentSweep: () => this.consent.scheduleSweep(),
      refreshViewport: () => void this.tabSetup.viewport?.refreshActive(),
    });
    const inputStack = createInputStack(this);
    this.input = inputStack.input;
    this.harvester = inputStack.harvester;
    this.shieldBreaker = inputStack.shieldBreaker;
    this.marksOverlay = inputStack.marksOverlay;
    this.downloads = inputStack.downloads;
    this.sessions = inputStack.sessions;
    this.network = inputStack.network;
    this.scripts = inputStack.scripts;
    this.jev = createJevController(this);
    this.consent = createConsentController(this);
    this.research = new ResearchSessionSurface({ hostProfile: this.hostProfile, log: this.log });
    this.researchView = createResearchViewSurface(this);
    const harvestNav = createHarvestNavStack(this);
    this.marks = harvestNav.marks;
    this.harvest = harvestNav.harvest;
    this.nav = harvestNav.nav;
    this.prerenderEngine = harvestNav.prerender;
    const interaction = createInteractionStack(this);
    this.hil = interaction.hil;
    this.primitives = interaction.primitives;
    this.actionLedger = interaction.actionLedger;
    const stack = createLlmStack(this);
    this.llmSurface = stack.llmSurface;
    this.researchLlmSurface = stack.researchLlmSurface;
    this.searchHub = stack.searchHub;
    this.llm = stack.llm;
    this.search = stack.search;
    this.crawl = stack.crawl;
    this.shadow = createShadowWalkSurface(this);
    startLoops(this);
  }

  /** Mirror every decision call into the HUD; the ring buffer lets a late renderer catch up. */
  /** Uptime broadcast and HUD-health watchdog. */
  // ---- Deck chrome --------------------------------------------------------------------
  // The panel view, its mode transitions, the orb geometry and the collab wiring
  // live in DeckController; the public field is the surface callers use.

  deck!: DeckController;

  // ---- JEV (Just-Enough-View) page compaction -----------------------------------------
  // The policy, funnel, loop breaker, stats and depth store live in JevController;
  // these delegations keep the chassis's public surface unchanged.

  readonly jev!: JevController;





/** Send to the shell window only (the deck panel receives through DeckController). */
  // ---- Research session ---------------------------------------------------------------
  // The stealth research session, its settings and the per-host cooldown live in
  // ResearchSessionSurface; the crawl and search surfaces read through it.

  /** The responsive viewport controller; available once the window is set. */
  /** Keep the deck overlay and the emulated tab viewport in step. */
  /** The shell window, or null before boot / after close. */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /** Adopt the shell window (boot step). */
  public setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  /** Create the tray bound to the shell window (boot step). */
  public createTray(win: BrowserWindow): void {
    this.trayManager = new TrayManager({ mainWindow: win, closeToTrayDefault: false });
  }

  /** Register the renderer IPC channels (boot step). */
  public registerIpc(): void {
    this.ipc = createIpcSurface(this);
    this.ipc.register();
  }

  /** Log a completed download to the HUD and telemetry. */
  public logDownload(record: DownloadNotice): void {
    this.telemetry.addLog('info', `Download Complete: "${record.filename}" (${record.totalBytes} bytes) saved to data/downloads/`);
    this.telemetry.emitSimpleEvent('harvest', `File Download Complete: ${record.filename}`);
  }

  /** Install the persisted page-zoom policy (compensate vs Windows scale). */
  // ---- Page zoom ----------------------------------------------------------------------
  // Mode, override and the display-scale base factor live in ZoomController; these
  // delegations keep the chassis's public surface unchanged.

  zoom!: ZoomController;

  /** The shared Cortex database (bookmarks, history, recall). */
  readonly cortex = cortex;

  // ---- Consent sweep ------------------------------------------------------------------
  // The answered-origins memory, the timed sweep and the explicit dismiss live in
  // ConsentController.

  readonly consent!: ConsentController;

  // ---- Screenshot persistence ---------------------------------------------------------
  // The screenshot store lives in the harvest stack; this class no longer owns it.

  // ---- Primitives layer (observe / act / wait / extract / collect / find) ----

}
