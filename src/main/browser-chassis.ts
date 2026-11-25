import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, screen, session, WebContentsView, type WebContents } from 'electron';
import type { AgentStatus, ChassisState, HarvestedConstruct, TelemetryEvent, TabSummary } from '../shared/types.js';

import { ViewportController } from './viewport/controller.js';
import { ZoomController } from './zoom/controller.js';
import { InputSurface } from './input/input-surface.js';
import { TelemetrySurface } from './telemetry/telemetry-surface.js';
import { humanListenerScript } from './input/human-activity.js';
import { HumanControlSurface } from './input/human-control.js';
import { NavigationSurface } from './navigation/navigation-surface.js';
import { CollaborationSurface } from './collaboration/surface.js';
import { bump } from './metrics.js';
import { ActionLedger } from './telemetry/action-ledger.js';
import { ConstructHarvester } from './harvester/markdown.js';
import { JevController } from './jev/controller.js';
import { DeckController } from './deck/controller.js';
import { HarvestSurface } from './harvest/harvest-surface.js';
import { decisionStatus, onDecision } from './decide/decision-client.js';
import { DecisionSurface } from './decide/decision-surface.js';
import { captureScreenshotJpeg } from './capture/screenshot-jpeg.js';
import { detectHostBrowserProfile, type HostBrowserProfile } from './telemetry/host-fingerprint.js';
import { TabManager, type TabInstance } from './tabs/tab-manager.js';
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
import type { ScriptItem } from './cortex/cortex-db.js';
import { TrayManager } from './tray/tray-manager.js';
import { WindowSurface } from './window/window-surface.js';
import { researchError } from './research/session-controller.js';
import { ResearchViewSurface } from './research/research-view-surface.js';
import { ResearchSessionSurface } from './research/research-session-surface.js';
import { CrawlSurface } from './research/crawl-surface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { HilSurface } from './hil/hil-surface.js';
import { queryJsonData, type JsonQueryParams } from './utils/json-query.js';
import type { JsonQueryResult } from './utils/json-navigator.js';
import { ConsoleLogBuffer } from './diagnostics/console-log.js';
import { RenderedSnapshotEngine } from './snapshots/rendered-snapshot.js';
import { PrerenderEngine, type PrerenderOptions } from './prerender/prerender-engine.js';
import { isTakeoverShortcut } from './takeover-key.js';
import { HudWatchdog } from './boot/hud-watchdog.js';
import { WindowBootSurface } from './boot/window-boot.js';
import { ShellBus } from './shell/event-bus.js';
import { createLlmStack } from './chassis/llm-stack.js';
import { createInputStack } from './chassis/input-stack.js';
import { createHarvestNavStack } from './chassis/harvest-nav-stack.js';
import { createInteractionStack } from './chassis/interaction-stack.js';
import { createIpcSurface, type IpcSurface } from './ipc/ipc-surface.js';
import { readPageInfo } from './tabs/page-info.js';
import { TabSurface } from './tabs/tab-surface.js';
import { createTabEventHandlers } from './tabs/tab-events.js';
import { TabSetupSurface } from './tabs/tab-setup.js';
import { displayScale } from './zoom/display-scale.js';
import { LlmSurface } from './llm/llm-surface.js';
import { ReadSurface } from './llm/read-surface.js';
import { SearchHub, engineHost } from './search/search-engine.js';
import { SearchSurface } from './search/search-surface.js';
import { type CitationRelocation } from './research/anchors.js';


export class BrowserChassis {
  private mainWindow: BrowserWindow | null = null;
  /** Window visibility, focus and close-to-tray behaviour. */
  readonly window = new WindowSurface({
    window: () => this.mainWindow,
    tray: () => this.trayManager,
  });
  /** Shared controller hooks: every controller config wires the same log and telemetry. */
  private readonly controllerLog = (level: 'info' | 'warn' | 'action', message: string): void => this.telemetry.addLog(level, message);
  private readonly controllerTelemetry = (event: TelemetryEvent): void => this.telemetry.emitTelemetry(event);
  /** The research activity feed hook shared by the read/search surfaces. */
  private readonly surfaceActivity = <T>(
    tool: string,
    summary: string,
    describe: (result: T) => string,
    run: () => Promise<T>,
  ): Promise<T> => this.crawl.activity(tool, summary, describe, run);
  /** Decision log and the guard-driven human hand-off. */
  readonly decision = new DecisionSurface({
    hil: () => this.hil,
    pageUrl: () => this.getPageInfo().url,
  });
  /** Tab manager and viewport controller, built with the window. */
  readonly tabSetup!: TabSetupSurface;
  readonly input!: InputSurface;
  readonly harvester!: ConstructHarvester;
  /** JEV page compaction: surface index + in-memory depth store. */
  private shieldBreaker!: ShieldBreaker;
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
  private prerenderEngine!: PrerenderEngine;
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
  readonly human = new HumanControlSurface({
    markHuman: () => {
      this.state.agentStatus = 'HUMAN_INPUT';
      this.state.activeAction = 'Human control — agent paused';
      this.telemetry.broadcastState();
    },
    markIdle: () => {
      if (this.state.agentStatus === 'HUMAN_INPUT') {
        this.state.agentStatus = 'IDLE';
        this.state.activeAction = 'Human handed back control';
        this.telemetry.broadcastState();
      }
    },
    log: (level, message) => this.telemetry.addLog(level, message),
    emitHumanActivity: (activity) =>
      this.telemetry.emitTelemetry({
        type: 'click',
        timestamp: activity.at,
        details: `HUMAN ${activity.kind}${activity.target ? ` on ${activity.target}` : ''} — agent still has control`,
      }),
    focusActiveTab: () => {
      try {
        const wc = this.getActiveWebContents();
        this.mainWindow?.focus();
        wc.focus();
      } catch {
        /* window/tab closing */
      }
    },
    currentUrl: () => this.state.currentUrl,
  });
  /** True while a person has explicitly taken control from the HUD. */
  /** How to answer a consent wall. KUANG_CONSENT_POLICY=essential|accept|reject. */
  private consentPolicy: ConsentPolicy = (() => {
    const raw = String(process.env.HB_CONSENT_POLICY ?? process.env.KUANG_CONSENT_POLICY ?? '').toLowerCase();
    return raw === 'accept' || raw === 'reject' ? (raw as ConsentPolicy) : 'essential';
  })();
  /** Monotonic page revision: bumped on navigation and every mutating action. */
  private revision = 0;
  /** The shell-window boot deps, kept out of the constructor. */
  private createWindowBoot(): WindowBootSurface {
    return new WindowBootSurface({
      setMainWindow: (win) => {
        this.mainWindow = win;
      },
      hilSetWindow: (win) => this.hil.manager.setWindow(win),
      hudWatch: (win) => this.hud.watch(win),
      toggleHuman: () => this.human.toggle(),
      createTray: (win) => {
        this.trayManager = new TrayManager({ mainWindow: win, closeToTrayDefault: false });
      },
      attachDownloads: (session) => this.downloads.manager.attachToSession(session),
      onDownloadComplete: (handler) => this.downloads.manager.onDownloadComplete(handler),
      logDownload: (record) => {
        this.telemetry.addLog('info', `Download Complete: "${record.filename}" (${record.totalBytes} bytes) saved to data/downloads/`);
        this.telemetry.emitSimpleEvent('harvest', `File Download Complete: ${record.filename}`);
      },
      setupTabs: () => this.tabSetup.setup(),
      registerIpc: () => {
        this.ipc = createIpcSurface(this);
        this.ipc.register();
      },
      setupDeck: () => this.deck.setup(),
    });;
  }

  /** The tab manager's lifecycle reactions. */
  private tabEvents!: ReturnType<typeof createTabEventHandlers>;
  /** The shell-window boot sequence. */
  readonly boot!: WindowBootSurface;
  /** The page overlay picker and its signal channel. */
  readonly collaboration = new CollaborationSurface({
    activeWebContents: () => this.getActiveWebContents(),
    pageInset: () => this.deck.pageInset(),
    setCollabMode: (open) => this.deck.setCollabMode(open),
    resolveNote: (id) => this.deck.resolveNote(id),
    forwardClassEdit: (target, added, removed) => this.deck.forwardClassEdit(target, added, removed),
    log: (level, message) => this.telemetry.addLog(level, message),
  });
  /** Renderer IPC channels. */
  ipc!: IpcSurface;
  /** Open/switch/close and the DevTools toggle. */
  readonly tabOps!: TabSurface;
  /** The render fan-out for the shell and the deck. */
  readonly bus = new ShellBus({
    window: () => this.mainWindow,
    deckView: () => this.deck.getView(),
  });
  /** HUD heartbeat and viewport-recovery watchdog. */
  readonly hud = new HudWatchdog({
    window: () => this.mainWindow,
    reassertViewport: () => this.reassertViewport(),
    applyZoomToAllTabs: () => this.zoom.applyToAllTabs(),
    logEvent: (name) => logMainEvent(name),
  });

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
    this.tabEvents = createTabEventHandlers({
      state: this.state,
      activeTabId: () => this.tabSetup.manager?.getActiveTabId(),
      allTabs: () => this.tabSetup.manager?.allTabs() ?? [],
      broadcastState: () => this.telemetry.broadcastState(),
      bumpRevision: () => this.bumpRevision(),
      reassertViewport: () => this.reassertViewport(),
      send: (channel, payload) => this.bus.toSurfaces(channel, payload),
      updateTray: (pending) =>
        this.trayManager?.updateStatus(this.state.agentStatus, this.state.tabs?.length ?? 0, pending),
      hilPending: () => !!this.hil.manager.getActiveRequest(),
      attachNetwork: (wc) => this.network.manager.attach(wc),
      registerViewportTab: (tab) => this.tabSetup.viewport?.registerTab(tab),
      syncForceOpen: (wc) => this.shadow.syncForceOpen(wc),
      indexTab: (tab) => this.harvest.indexTabQuietly(tab),
      ingestHuman: (message) => this.human.monitor.ingest(message),
      noteHuman: (activity) => this.human.note(activity),
      recordConsole: (log) => this.consoleLogs.record(log),
      collaborationSignal: (message) => this.collaboration.handleSignal(message),
      logEvent: (name, detail) => logMainEvent(name, detail),
      humanListenerScript: () => humanListenerScript(),
    });
    this.tabSetup = new TabSetupSurface({
      window: () => this.mainWindow,
      hostProfile: this.hostProfile,
      deviceProfilesPath: () => path.join(app.getPath('userData'), 'device-profiles.json'),
      docked: () => this.deck.getMode() === 'docked',
      log: (level, message) => this.telemetry.addLog(level, message),
      broadcastState: () => this.telemetry.broadcastState(),
      positionDeck: () => this.deck.position(),
      bringDeckToFront: () => this.deck.bringToFront(),
      applyZoomStep: (action) => this.zoom.setZoom({ action }),
      applyZoom: (wc) => this.zoom.applyTo(wc),
      setInputScale: (wc, scale) => this.input.simulator.setViewportScale(wc, scale),
      toggleHuman: () => this.human.toggle(),
      tabEvents: this.tabEvents,
    });
    this.boot = this.createWindowBoot();
    this.subscribeToDecisions();
    this.page = this.createPageScriptSurface();
    this.tabOps = new TabSurface({
      manager: () => this.requireTabManager(),
      activeWebContents: () => this.getActiveWebContents(),
      log: (level, message) => this.telemetry.addLog(level, message),
      purgeJev: () => this.purgeJevDepthStore(),
      scheduleConsentSweep: () => this.consent.scheduleSweep(),
      refreshViewport: () => void this.tabSetup.viewport?.refreshActive(),
    });
    const inputStack = this.createInputStack();
    this.input = inputStack.input;
    this.harvester = inputStack.harvester;
    this.shieldBreaker = inputStack.shieldBreaker;
    this.marksOverlay = inputStack.marksOverlay;
    this.downloads = inputStack.downloads;
    this.sessions = inputStack.sessions;
    this.network = inputStack.network;
    this.scripts = inputStack.scripts;
    this.research = this.createResearchSession();
    this.researchView = this.createResearchViewSurface();
    const harvestNav = this.createHarvestNavigationSurfaces();
    this.marks = harvestNav.marks;
    this.harvest = harvestNav.harvest;
    this.nav = harvestNav.nav;
    this.prerenderEngine = harvestNav.prerender;
    const interaction = createInteractionStack(this);
    this.hil = interaction.hil;
    this.primitives = interaction.primitives;
    this.actionLedger = interaction.actionLedger;
    const stack = this.createLlmStack();
    this.llmSurface = stack.llmSurface;
    this.researchLlmSurface = stack.researchLlmSurface;
    this.searchHub = stack.searchHub;
    this.llm = stack.llm;
    this.search = stack.search;
    this.crawl = stack.crawl;
    this.shadow = this.createShadowWalkSurface();
    this.startLoops();
  }

  /** Mirror every decision call into the HUD; the ring buffer lets a late renderer catch up. */
  private subscribeToDecisions(): void {
    // Mirror every decision call into the HUD's DECISIONS tab. The listener is passive: it cannot
    // delay or fail a decision (see emitDecision), and the ring buffer lets a late-joining renderer
    // catch up.
    onDecision((event) => {
      this.decision.record(event);
      this.bus.toSurfaces('chassis:decision', event);
    });
  }

  /** The LLM/search/crawl stack, kept out of the constructor. */
  private createLlmStack(): ReturnType<typeof createLlmStack> {
    return createLlmStack({
      activeSession: () => this.getActiveWebContents().session,
      activeWebContents: () => {
        try {
          return this.getActiveWebContents();
        } catch {
          return null;
        }
      },
      navigateForText: (url) => this.researchView.navigateForText(url),
      userAgent: this.hostProfile.userAgent,
      renderMarkdown: (url) => this.readUrlRender(url),
      research: this.research,
      researchView: this.researchView,
      activity: this.surfaceActivity,
      log: this.controllerLog,
      harvester: () => this.harvester,
      indexPage: (url, title, content) => cortex.indexPage(url, title, content),
      broadcast: (channel, payload) => this.bus.broadcast(channel, payload),
    });
  }

  /** The input/diagnostic stack, kept out of the constructor. */
  private createInputStack(): ReturnType<typeof createInputStack> {
    return createInputStack({
      activeWebContents: () => this.getActiveWebContents(),
      state: this.state,
      log: this.controllerLog,
      pointEvent: (type, point, details) => this.telemetry.emitPointEvent(type, point, details),
      telemetryEvent: (event) => this.telemetry.emitTelemetry(event),
      simpleEvent: (type, details) => this.telemetry.emitSimpleEvent(type, details),
      reportActing: () => this.telemetry.reportActing(),
      reportIdle: () => this.telemetry.reportIdle(),
      emitHarvest: (details) => this.telemetry.emitHarvestDetails(details),
      broadcastState: () => this.telemetry.broadcastState(),
      bumpRevision: () => this.bumpRevision(),
      markSynthetic: (at) => this.human.monitor.markSynthetic(at),
      humanActive: () => this.human.isActive(),
    });
  }

  /** Marks, harvest and navigation, in dependency order (prerender before nav). */
  private createHarvestNavigationSurfaces(): ReturnType<typeof createHarvestNavStack> {
    return createHarvestNavStack({
      activeWebContents: () => this.getActiveWebContents(),
      revision: () => this.revision,
      marksOverlay: this.marksOverlay,
      simulator: {
        clickAt: (wc, point) => this.input.simulator.clickAt(wc, point),
        clearFocusedField: (wc) => this.input.simulator.clearFocusedField(wc),
        typeText: (wc, text) => this.input.simulator.typeText(wc, text),
      },
      log: this.controllerLog,
      telemetry: this.controllerTelemetry,
      reportActing: () => this.telemetry.reportActing(),
      reportIdle: () => this.telemetry.reportIdle(),
      emitClick: (point, details) => this.telemetry.emitPointEvent('click', point, details),
      bumpRevision: () => this.bumpRevision(),
      viewportBounds: () => this.tabSetup.bounds(),
      zoomState: () => this.zoom.getState(),
      harvester: this.harvester,
      beginHarvest: () => {
        this.state.agentStatus = 'HARVESTING';
        this.telemetry.broadcastState();
      },
      onConstruct: (construct) => {
        this.latestConstruct = construct;
        this.bus.toSurfaces('chassis:construct-harvested', construct);
      },
      addTokens: (tokens) => {
        this.state.stats.tokensHarvested += tokens;
      },
      emitHarvest: (details) => this.telemetry.emitSimpleEvent('harvest', details),
      indexPage: (url, title, content) => cortex.indexPage(url, title, content),
      hostProfile: this.hostProfile,
      createTab: (url, view) => {
        this.tabSetup.manager?.createTab(url, view);
      },
      welcomePagePath: () => this.tabSetup.manager?.getWelcomePagePath(),
      beginTraversal: () => {
        this.state.agentStatus = 'TRAVERSING';
        this.telemetry.broadcastState();
      },
      bumpNav: () => bump('nav'),
      purgeJev: () => this.purgeJevDepthStore(),
      syncForceOpen: (wc) => this.shadow.syncForceOpen(wc),
      scheduleConsentSweep: () => this.consent.scheduleSweep(),
      broadcastState: () => this.telemetry.broadcastState(),
      refuseShadow: (surface) => assertShadowSurface(surface),
    });
  }

  /** Bounds of the browser viewport as actually laid out in the HUD (zoom-aware). */
  private async computeViewportBounds(): Promise<{ x: number; y: number; width: number; height: number }> {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return this.tabSetup.bounds();
    try {
      const rect = await win.webContents.executeJavaScript(
        `(() => {
          const el = document.getElementById('viewport-container');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        })()`,
      );
      if (rect && rect.width > 0 && rect.height > 0) {
        const zoom = win.webContents.getZoomFactor() || 1;
        return {
          x: Math.round(rect.x * zoom),
          y: Math.round(rect.y * zoom),
          width: Math.round(rect.width * zoom),
          height: Math.round(rect.height * zoom),
        };
      }
    } catch {
      /* fall back to the static calculation */
    }
    return this.tabSetup.bounds();
  }

  /** The shared detached view plus citations and the human hand-off. */
  private createResearchViewSurface(): ResearchViewSurface {
    return new ResearchViewSurface({
      userAgent: this.hostProfile.userAgent,
      activate: (wc) => this.research.activateView(wc),
      window: () => this.mainWindow,
      hilManager: () => this.hil.manager,
      researchSettings: () => this.research.settings(),
      viewportBounds: () => this.computeViewportBounds(),
      reassertViewport: () => this.reassertViewport(),
      activeWebContents: () => this.getActiveWebContents(),
      log: (level, message) => this.telemetry.addLog(level, message),
    });
  }

  /** Script evaluation and control description over the active tab. */
  private createPageScriptSurface(): PageScriptSurface {
    return new PageScriptSurface({
      activeWebContents: () => this.getActiveWebContents(),
      log: (level, message) => this.telemetry.addLog(level, message),
    });
  }

  /** Shadow Walk policy and frame reads over the active tab. */
  private createShadowWalkSurface(): ShadowWalkSurface {
    return new ShadowWalkSurface({
      activeWebContents: () => this.getActiveWebContents(),
      allTabs: () => this.tabSetup.manager?.allTabs() ?? [],
      log: (level, message) => this.telemetry.addLog(level, message),
      pressKey: (wc, key) => this.input.simulator.pressKey(wc, key),
      bumpRevision: () => this.bumpRevision(),
      capturePage: (wc, bounds) => this.harvest.capturePageWithRetry(wc, bounds),
    });
  }

  /** Uptime broadcast and HUD-health watchdog. */
  private startLoops(): void {
    setInterval(() => {
      this.state.stats.uptimeSeconds++;
      this.telemetry.broadcastState();
    }, 1000);

    // A renderer can stop painting without exiting. The watchdog reloads it once
    // if the heartbeat goes quiet while the window is visible.
    this.hud.start();
  }

  public reassertViewport(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      this.deck.position();
    } catch {
      // A settings surface can temporarily hide the sidebar.
    }
    this.tabSetup.manager?.updateActiveTabBounds();
    try {
      this.mainWindow.webContents.invalidate();
    } catch {
      // Window is closing.
    }
    for (const tab of this.tabSetup.manager?.allTabs() ?? []) {
      try {
        if (!tab.view.webContents.isDestroyed()) tab.view.webContents.invalidate();
      } catch {
        // Tab closed during the sweep.
      }
    }
  }

  // ---- Deck chrome --------------------------------------------------------------------
  // The panel view, its mode transitions, the orb geometry and the collab wiring
  // live in DeckController; the public field is the surface callers use.

  readonly deck = new DeckController({
    window: () => this.mainWindow,
    loadPanel: (view) => {
      const devUrl = process.env.VITE_DEV_SERVER_URL;
      if (devUrl) {
        const url = new URL(devUrl);
        url.searchParams.set('sidebar', '1');
        view.webContents.loadURL(url.toString());
      } else {
        view.webContents.loadFile(path.join(__dirname, '../../dist/index.html'), {
          query: { sidebar: '1' },
        });
      }
    },
    popupPreloadPath: path.join(__dirname, '../preload/index.js'),
    activeWebContents: () => this.getActiveWebContents(),
    pageUrl: () => this.getPageInfo().url,
    log: (level, message) => this.telemetry.addLog(level, message),
    onModeChanged: () => this.tabSetup.manager?.updateActiveTabBounds(),
    sendToShell: (channel, payload) => this.bus.toShell(channel, payload),
    onPanelLoaded: () => this.deck.sendToPanel('chassis:decision-status', decisionStatus()),
    stopSelection: () => this.collaboration.stopSelection(),
  });



  // ---- JEV (Just-Enough-View) page compaction -----------------------------------------
  // The policy, funnel, loop breaker, stats and depth store live in JevController;
  // these delegations keep the chassis's public surface unchanged.

  readonly jev = new JevController({
    policy: () => ({ available: false, enforce: false }),
    pageInfo: () => this.getPageInfo(),
    evaluate: (script) => this.page.quiet(script),
    harvest: () => this.harvest.harvestMarkdown(),
  });

  private purgeJevDepthStore(): void {
    this.jev.purge();
  }





/** Send to the shell window only (the deck panel receives through DeckController). */
  // ---- Research session ---------------------------------------------------------------
  // The stealth research session, its settings and the per-host cooldown live in
  // ResearchSessionSurface; the crawl and search surfaces read through it.

  private createResearchSession(): ResearchSessionSurface {
    return new ResearchSessionSurface({
      hostProfile: this.hostProfile,
      log: (level, message) => this.telemetry.addLog(level, message),
    });
  }

  /**
   * The tab manager, or the standard uninitialized failure. Every tab operation
   * begins with this check; the message is the contract agents retry on.
   */
  private requireTabManager(): TabManager {
    const manager = this.tabSetup.manager;
    if (!manager) throw new Error('Browser Chassis uninitialized');
    return manager;
  }

  /** The tab manager; the bridge cannot reach a tab before the window exists. */
  get tabs(): TabManager {
    return this.requireTabManager();
  }

  /** The responsive viewport controller; available once the window is set. */
  /** Keep the deck overlay and the emulated tab viewport in step. */
  setViewportVisibility(visible: boolean): void {
    this.tabSetup.manager?.setViewportVisibility(visible);
    this.deck.setOverlayVisible(visible);
  }

  get viewport(): ViewportController {
    if (!this.tabSetup.viewport) throw new Error('Browser Chassis uninitialized');
    return this.tabSetup.viewport;
  }

  public getActiveWebContents(): Electron.WebContents {
    const wc = this.requireTabManager().getActiveTab().view.webContents;
    this.network.manager.attach(wc);
    return wc;
  }

  /** Install the persisted page-zoom policy (compensate vs Windows scale). */
  // ---- Page zoom ----------------------------------------------------------------------
  // Mode, override and the display-scale base factor live in ZoomController; these
  // delegations keep the chassis's public surface unchanged.

  readonly zoom = new ZoomController({
    displayScale: () => displayScale(this.mainWindow),
    viewportState: () => this.tabSetup.viewport?.state() ?? null,
    isEmulated: (wc) => Boolean(this.tabSetup.viewport?.isEmulated(wc as any)),
    bounds: () => this.tabSetup.bounds(),
    webContentsList: () => (this.tabSetup.manager?.allTabs() ?? []).map((tab) => ({ webContents: tab.view.webContents })),
    onChanged: () => this.telemetry.broadcastState(),
  });


  /** The shared Cortex database (bookmarks, history, recall). */
  readonly cortex = cortex;

  public captureScreenshotJpeg(maxSide = 1400, quality = 82) {
    return captureScreenshotJpeg(
      {
        capturePage: () => this.harvest.capturePageWithRetry(this.getActiveWebContents(), this.tabSetup.bounds()),
        log: (level, message) => this.telemetry.addLog(level, message),
      },
      maxSide,
      quality,
    );
  }

  // ---- Consent sweep ------------------------------------------------------------------
  // The answered-origins memory, the timed sweep and the explicit dismiss live in
  // ConsentController.

  readonly consent = new ConsentController({
    activeWebContents: () => this.getActiveWebContents(),
    shieldBreaker: () => this.shieldBreaker,
    policy: () => this.consentPolicy,
    log: this.controllerLog,
    telemetry: this.controllerTelemetry,
  });


  // ---- Screenshot persistence ---------------------------------------------------------
  // The screenshot store lives in the harvest stack; this class no longer owns it.

  public getPageInfo() {
    return readPageInfo(this.state, this.tabSetup.manager?.getActiveTab() ?? null);
  }

  public queryJsonData(params: JsonQueryParams): JsonQueryResult {
    this.telemetry.addLog('action', `MCP Directive: query_json_data(${params.source}${params.sourceId ? `:${params.sourceId}` : ''}, view=${params.view || 'value'})`);
    return queryJsonData(params, {
      payloadJson: (sourceId) => this.network.manager.getPayload(sourceId).data,
      streamPayloads: (sourceId, limit) =>
        this.network.manager
          .getStreamMessages({ streamId: sourceId, limit })
          .map((message) => (message.jsonData !== undefined ? message.jsonData : message.data)),
      downloadsDir: () => dataPath('downloads'),
    });
  }

  public async prerenderLinks(options: PrerenderOptions = {}): Promise<{ prerendered: string[]; count: number }> {
    const wc = this.getActiveWebContents();
    this.telemetry.addLog('action', `MCP Directive: prerender_links(maxPages=${options.maxPages || 3})`);
    return await this.prerenderEngine.prerender(wc, options);
  }

  // ---- LLM-friendly site discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6) ----






  /**
   * Renders a URL in the shared detached view and distils it to Markdown — the composite
   * `read_url` fallback. Deliberately not `crawlRenderPage`: `read_url` is a single-page
   * *read* (no crawl budgets, no link harvesting), so it does not consume crawl policy.
   */
  public async readUrlRender(
    url: string,
  ): Promise<{ markdown: string; title: string; status: number; contentType: string | null }> {
    const r = await this.researchView.load<{ title: string }>(
      url,
      '(() => ({ title: document.title || "" }))()',
      {
        timeoutMs: 25000,
        after: async (wc) => (await RenderedSnapshotEngine.capture(wc, { format: 'markdown', waitUntilIdleMs: 400 })).content,
      },
    );
    return { markdown: r.after || '', title: r.result?.title || url, status: r.status, contentType: r.contentType };
  }

  // ---- Primitives layer (observe / act / wait / extract / collect / find) ----

  public getRevision(): number {
    return this.revision;
  }

  public bumpRevision(): number {
    return ++this.revision;
  }

}
