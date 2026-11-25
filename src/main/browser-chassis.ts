import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, screen, session, WebContentsView, type WebContents } from 'electron';
import type { AgentStatus, ChassisState, HarvestedConstruct, TelemetryEvent, TabSummary } from '../shared/types.js';
import { DeviceProfileStore } from './viewport/profiles.js';
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
import { ScreenshotStore } from './harvest/screenshots.js';
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
import { IpcSurface } from './ipc/ipc-surface.js';
import { readPageInfo } from './tabs/page-info.js';
import { TabSurface } from './tabs/tab-surface.js';
import { createTabEventHandlers } from './tabs/tab-events.js';
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
  /** Recent decision-model calls, mirrored to the HUD (newest last, capped at 50). */
  /** Decision log and the guard-driven human hand-off. */
  readonly decision = new DecisionSurface({
    hil: () => this.hil,
    pageUrl: () => this.getPageInfo().url,
  });
  /** Throttle for gate-triggered human hand-offs (one per URL per few minutes). */
  private lastGateHil: { url: string; at: number } | null = null;
  private tabManager: TabManager | null = null;
  readonly input!: InputSurface;
  private harvester!: ConstructHarvester;
  /** JEV page compaction: surface index + in-memory depth store. */
  private shieldBreaker!: ShieldBreaker;
  readonly downloads!: DownloadSurface;
  readonly sessions!: SessionSurface;
  readonly network!: NetworkSurface;
  private marksOverlay!: MarksOverlay;
  readonly marks: MarksSurface;
  readonly harvest: HarvestSurface;
  readonly nav: NavigationSurface;
  readonly scripts!: ScriptsSurface;
  private trayManager: TrayManager | null = null;
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
  private actionLedger!: ActionLedger;
  /** Reused off-screen view for detached reads (SERPs, Markdown alternates, crawls). */
  /** Origins a human has authenticated; skip the anonymous static tier for them. */
  /** Only one human hand-off at a time (the shared research view is serialized). */
  /** Why the last hand-off was skipped (surfaced in the WAF error). */
  /** Responsive device emulation; one controller for the whole browser. */
  private viewportController: ViewportController | null = null;

  private sidebarView: WebContentsView | null = null;
  private sidebarMode: 'docked' | 'floating' | 'collapsed' = 'floating';
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
  private hudShortcutBound = false;
  /** How to answer a consent wall. KUANG_CONSENT_POLICY=essential|accept|reject. */
  private consentPolicy: ConsentPolicy = (() => {
    const raw = String(process.env.HB_CONSENT_POLICY ?? process.env.KUANG_CONSENT_POLICY ?? '').toLowerCase();
    return raw === 'accept' || raw === 'reject' ? (raw as ConsentPolicy) : 'essential';
  })();
  private lastOpenSidebarMode: 'docked' | 'floating' = 'floating';
  /** Running sidebar bounds animation, so a new target or a snap can cancel it. */
  private sidebarBoundsAnimation: { cancelled: boolean } | null = null;
  /** Collab mode: the orb is replaced by the collaborations toolbar pill. */
  private collabMode = false;
  /** Current note in the back/forward cycle through open collaboration threads. */
  private collabFocusIndex = -1;
  /** Which vertical edge the collapsed orb docks to (survives restarts via the sidebar renderer). */
  private orbEdge: 'left' | 'right' = 'right';
  /** False while a full-window settings/dialog surface is open. */
  private sidebarOverlayVisible = true;
  /** Monotonic page revision: bumped on navigation and every mutating action. */
  private revision = 0;
  /** The tab manager's lifecycle reactions. */
  private tabEvents!: ReturnType<typeof createTabEventHandlers>;
  /** The page overlay picker and its signal channel. */
  readonly collaboration = new CollaborationSurface({
    activeWebContents: () => this.getActiveWebContents(),
    pageInset: () => this.deck.pageInset(),
    setCollabMode: (open) => this.deck.setCollabMode(open),
    resolveNote: (id) => this.deck.resolveNote(id),
    forwardClassEdit: (target, added, removed) => this.deck.forwardClassEdit(target, added, removed),
    log: (level, message) => this.telemetry.addLog(level, message),
  });
  /** Page zoom policy: fit the page to the OS display scale, or honour Windows scale. */
  /** Explicit zoom from the toolbar or an agent; null means use the policy base. */
  /** Renderer IPC channels. */
  ipc!: IpcSurface;
  /** Open/switch/close and the DevTools toggle. */
  readonly tabOps!: TabSurface;
  /** HUD heartbeat and viewport-recovery watchdog. */
  readonly hud = new HudWatchdog({
    window: () => this.mainWindow,
    reassertViewport: () => this.reassertViewport(),
    applyZoomToAllTabs: () => this.zoom.applyToAllTabs(),
    logEvent: (name) => logMainEvent(name),
  });

  private state: ChassisState = {
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
    send: (channel, payload) => this.sendToSurfaces(channel, payload),
    zoomState: () => this.zoom.getState(),
    viewportState: () => this.viewportController?.state(),
    activeWebContents: () => this.tabManager?.getActiveTab()?.view?.webContents ?? null,
  });

  private latestConstruct: HarvestedConstruct | null = null;
  /** Captured page console lines (bounded). */
  readonly consoleLogs = new ConsoleLogBuffer();

  constructor() {
    this.tabEvents = createTabEventHandlers({
      state: this.state,
      activeTabId: () => this.tabManager?.getActiveTabId(),
      allTabs: () => this.tabManager?.allTabs() ?? [],
      broadcastState: () => this.telemetry.broadcastState(),
      bumpRevision: () => this.bumpRevision(),
      reassertViewport: () => this.reassertViewport(),
      send: (channel, payload) => this.sendToSurfaces(channel, payload),
      updateTray: (pending) =>
        this.trayManager?.updateStatus(this.state.agentStatus, this.state.tabs?.length ?? 0, pending),
      hilPending: () => !!this.hil.manager.getActiveRequest(),
      attachNetwork: (wc) => this.network.manager.attach(wc),
      registerViewportTab: (tab) => this.viewportController?.registerTab(tab),
      syncForceOpen: (wc) => this.shadow.syncForceOpen(wc),
      indexTab: (tab) => this.harvest.indexTabQuietly(tab),
      ingestHuman: (message) => this.human.monitor.ingest(message),
      noteHuman: (activity) => this.human.note(activity),
      recordConsole: (log) => this.consoleLogs.record(log),
      collaborationSignal: (message) => this.collaboration.handleSignal(message),
      logEvent: (name, detail) => logMainEvent(name, detail),
      humanListenerScript: () => humanListenerScript(),
    });
    this.subscribeToDecisions();
    this.page = this.createPageScriptSurface();
    this.tabOps = new TabSurface({
      manager: () => this.requireTabManager(),
      activeWebContents: () => this.getActiveWebContents(),
      log: (level, message) => this.telemetry.addLog(level, message),
      purgeJev: () => this.purgeJevDepthStore(),
      scheduleConsentSweep: () => this.consent.scheduleSweep(),
      refreshViewport: () => void this.viewportController?.refreshActive(),
    });
    const inputSurfaces = this.createInputSurfaces();
    this.input = inputSurfaces.input;
    this.downloads = inputSurfaces.downloads;
    this.sessions = inputSurfaces.sessions;
    this.network = inputSurfaces.network;
    this.scripts = inputSurfaces.scripts;
    this.research = this.createResearchSession();
    this.researchView = this.createResearchViewSurface();
    const harvestNav = this.createHarvestNavigationSurfaces();
    this.marks = harvestNav.marks;
    this.harvest = harvestNav.harvest;
    this.nav = harvestNav.nav;
    const interaction = this.createInteractionSurfaces();
    this.hil = interaction.hil;
    this.primitives = interaction.primitives;
    const readSearch = this.createLlmSurfaces();
    this.llm = readSearch.llm;
    this.search = readSearch.search;
    this.crawl = this.createCrawlSurface();
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
      this.sendToSurfaces('chassis:decision', event);
    });
  }

  /** Input simulation, downloads, sessions, the network tap and the script vault. */
  private createInputSurfaces(): {
    input: InputSurface;
    downloads: DownloadSurface;
    sessions: SessionSurface;
    network: NetworkSurface;
    scripts: ScriptsSurface;
  } {
    this.harvester = new ConstructHarvester();
    const input = new InputSurface({
      activeWebContents: () => this.getActiveWebContents(),
      onMouseMove: (point, velocity) => {
        this.state.cursor = point;
        this.telemetry.emitPointEvent('mouse_move', point, `Velocity: ${velocity.toFixed(2)} px/ms`);
      },
      onClick: (point) => {
        this.state.stats.totalInteractions++;
        this.telemetry.emitPointEvent('click', point, 'Physical mouse switch actuated');
      },
      onKey: (char, delay) => {
        this.state.stats.totalInteractions++;
        this.telemetry.emitTelemetry({
          type: 'keystroke',
          key: char === ' ' ? 'SPACE' : char,
          durationMs: delay,
          timestamp: Date.now(),
          details: `Cadence variance: ${delay}ms`,
        });
      },
      onScroll: (deltaY) => {
        this.telemetry.emitSimpleEvent('scroll', `Mousewheel impulse: ${deltaY}px`);
      },
      markSynthetic: (at) => this.human.monitor.markSynthetic(at),
      humanActive: () => this.human.isActive(),
      status: {
        acting: () => {
          this.state.agentStatus = 'SIMULATING_INPUT';
        },
        idle: () => this.telemetry.reportIdle(),
        error: () => {
          this.state.agentStatus = 'ERROR';
          this.telemetry.broadcastState();
        },
      },
      log: (level, message) => this.telemetry.addLog(level, message),
      bumpRevision: () => this.bumpRevision(),
    });

    this.shieldBreaker = new ShieldBreaker(input.simulator);
    const downloads = new DownloadSurface({ log: this.controllerLog });
    const sessions = new SessionSurface({
      activeWebContents: () => this.getActiveWebContents(),
      log: this.controllerLog,
      emitHarvest: (details) => this.telemetry.emitHarvestDetails(details),
    });
    const network = new NetworkSurface({ log: this.controllerLog });
    const scripts = new ScriptsSurface({
      activeWebContents: () => this.getActiveWebContents(),
      log: this.controllerLog,
      reportActing: () => this.telemetry.reportActing(),
      reportIdle: () => this.telemetry.reportIdle(),
      emitHarvest: (details) => this.telemetry.emitHarvestDetails(details),
    });
    this.marksOverlay = new MarksOverlay();
    return { input, downloads, sessions, network, scripts };
  }

  /** Marks, harvest and navigation, in dependency order (prerender before nav). */
  private createHarvestNavigationSurfaces(): {
    marks: MarksSurface;
    harvest: HarvestSurface;
    nav: NavigationSurface;
  } {
    const marks = new MarksSurface({
      activeWebContents: () => this.getActiveWebContents(),
      revision: () => this.revision,
      marksOverlay: this.marksOverlay,
      simulator: {
        clickAt: (wc, point) => this.input.simulator.clickAt(wc, point),
        clearFocusedField: (wc) => this.input.simulator.clearFocusedField(wc),
        typeText: (wc, text) => this.input.simulator.typeText(wc, text),
      },
      refuseShadow: (surface) => assertShadowSurface(surface),
      log: this.controllerLog,
      reportActing: () => this.telemetry.reportActing(),
      reportIdle: () => this.telemetry.reportIdle(),
      emitClick: (point, details) => this.telemetry.emitPointEvent('click', point, details),
      bumpRevision: () => this.bumpRevision(),
    });
    const harvest = new HarvestSurface({
      activeWebContents: () => this.getActiveWebContents(),
      viewportBounds: () => this.getViewportBounds(),
      zoomState: () => this.zoom.getState(),
      marks,
      marksOverlay: this.marksOverlay,
      harvester: this.harvester,
      screenshotStore: this.screenshotStore,
      beginHarvest: () => {
        this.state.agentStatus = 'HARVESTING';
        this.telemetry.broadcastState();
      },
      onConstruct: (construct) => {
        this.latestConstruct = construct;
        this.sendToSurfaces('chassis:construct-harvested', construct);
      },
      addTokens: (tokens) => {
        this.state.stats.tokensHarvested += tokens;
      },
      reportIdle: () => this.telemetry.reportIdle(),
      emitHarvest: (details) => this.telemetry.emitSimpleEvent('harvest', details),
      log: this.controllerLog,
      indexPage: (url, title, content) => cortex.indexPage(url, title, content),
    });
    this.prerenderEngine = new PrerenderEngine(
      this.hostProfile,
      cortex,
      (level, msg) => this.telemetry.addLog(level, msg)
    );
    const nav = new NavigationSurface({
      activeWebContents: () => this.getActiveWebContents(),
      welcomePagePath: () => this.tabManager?.getWelcomePagePath(),
      createTab: (url, view) => {
        this.tabManager?.createTab(url, view);
      },
      prerender: {
        normalizeUrl: (url) => this.prerenderEngine.normalizeUrl(url),
        has: (url) => this.prerenderEngine.has(url),
        consume: (url) => this.prerenderEngine.consume(url),
      },
      beginTraversal: () => {
        this.state.agentStatus = 'TRAVERSING';
        this.telemetry.broadcastState();
      },
      log: this.controllerLog,
      bumpNav: () => bump('nav'),
      purgeJev: () => this.purgeJevDepthStore(),
      syncForceOpen: (wc) => this.shadow.syncForceOpen(wc),
      scheduleConsentSweep: () => this.consent.scheduleSweep(),
      bumpRevision: () => this.bumpRevision(),
      broadcastState: () => this.telemetry.broadcastState(),
    });
    return { marks, harvest, nav };
  }

  /** HIL, the action ledger and the orthogonal primitives layer. */
  private createInteractionSurfaces(): { hil: HilSurface; primitives: Primitives } {
    const hil = new HilSurface({
      activeWebContents: () => {
        try {
          return this.getActiveWebContents();
        } catch {
          return null;
        }
      },
      broadcast: (channel, payload) => {
        try {
          this.broadcast(channel, payload);
        } catch {
          // Broadcasts must never break the hand-off flow itself.
        }
      },
      onStateChanged: (pending, request) => {
        this.trayManager?.updateStatus(this.state.agentStatus, this.state.tabs?.length || 0, pending);
        if (pending && request) {
          this.state.agentStatus = 'AWAITING_INPUT';
          this.state.activeAction = `⚠️ HUMAN ACTION REQUIRED: ${request.reason}`;
        } else {
          this.state.agentStatus = 'IDLE';
          this.state.activeAction = 'Standby - Awaiting MCP Uplink';
        }
        this.telemetry.broadcastState();
      },
      log: (level, message) => this.telemetry.addLog(level, message),
      emitNavigation: (details) => this.telemetry.emitSimpleEvent('navigation', details),
    });

    // Action ledger — local, append-only record of executed actions and their outcomes
    // (data/transitions.jsonl). This is the dataset a runner-side decision model learns from;
    // it never leaves the machine and never stores typed text.
    this.actionLedger = new ActionLedger({
      dir: dataPath(),
      log: (level, msg) => this.telemetry.addLog(level, msg),
    });

    // Orthogonal primitives layer (observe / act / wait / extract / collect / find).
    // It borrows the chassis' real input + marks plumbing so it stays on the humanlike path.
    const primitives = new Primitives({
      webContents: () => this.getActiveWebContents(),
      log: (level, msg) => this.telemetry.addLog(level, msg),
      evaluate: (script) => this.page.quiet(script),
      harvest: (opts) => this.harvest.harvestMarkdown(opts),
    guardPageRead: (input) => this.jev.guardPageRead(input),
    precheckPageRead: (input) => this.jev.precheckPageRead(input),
      injectMarks: (opts) => this.marks.scan(this.getActiveWebContents(), opts || {}),
      removeMarks: () => this.marksOverlay.removeMarks(this.getActiveWebContents()),
      getMarks: () => this.marks.getActive(),
      getMarkTarget: (id) =>
        Number(id) >= 100
          ? resolveFrameMark(this.getActiveWebContents(), Number(id))
          : this.marksOverlay.getMarkTarget(this.getActiveWebContents(), id),
      getFrames: (opts) => this.shadow.getFrames(opts),
      evaluateInFrames: (script, opts) => this.page.evaluateInFrames(script, opts),
      resolveSealedToken: (token) => resolveSealedTarget(this.getActiveWebContents(), token),
      clickMark: (id) => this.marks.clickMark(id),
      typeMark: (id, text, opts) => this.marks.typeMark(id, text, opts),
      clickElement: (selector, coords) => this.input.clickElement(selector, coords),
      typeText: (text, selector, opts) => this.input.typeText(text, selector, opts),
      findSealed: (opts) => this.marks.findSealed(opts),
      componentSurfaceEnabled: () => loadShadowWalkSettings().shadow.componentSurface,
      insertText: (text) => this.input.insertText(text),
      pasteText: (text) => this.input.simulator.pasteText(this.getActiveWebContents(), text),
      moveMouseTo: (target) => this.input.moveMouse(target),
      pressKey: (key) => this.input.pressKey(key),
      snapshotRenderedPage: (opts) => this.marks.snapshotRenderedPage(opts),
      getNetworkTraffic: (filter) => this.network.traffic(filter),
      getPageInfo: () => this.getPageInfo(),
      revision: () => this.revision,
      windowFocused: () => this.window.isFocused(),
      recordTransition: (record) => this.actionLedger.record(record),
    });
    return { hil, primitives };
  }

  /** LLM read/search surfaces and their shared activity hook. */
  private createLlmSurfaces(): { llm: ReadSurface; search: SearchSurface } {
    // LLM-friendly site discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6).
    // `net.fetch` runs on Chromium's network stack (session cookies/UA/TLS); per-page
    // alternates go through a real document navigation instead of a synthetic fetch.
    const llmSurface = new LlmSurface({
      getSession: () => this.getActiveWebContents().session,
      getActiveWebContents: () => {
        try {
          return this.getActiveWebContents();
        } catch {
          return null;
        }
      },
      ...this.llmSurfaceBase(),
      renderPage: (url) => this.readUrlRender(url),
    });
    this.llmSurface = llmSurface;

    const researchLlmSurface = new LlmSurface({
      getSession: () => this.research.session(),
      ...this.llmSurfaceBase(),
    });
    this.researchLlmSurface = researchLlmSurface;

    // Multi-engine web search (TODO_RESEARCH_CRAWL.md §5, Feature 5).
    const searchHub = new SearchHub({
      load: (url, script, opts) => this.researchView.load(url, script, opts),
      log: (level, msg) => this.telemetry.addLog(level, msg),
    });
    this.searchHub = searchHub;

    const llm = new ReadSurface({
      probe: (url) => llmSurface.probe(url),
      fetch: (opts) => llmSurface.fetch(opts),
      readUrl: (opts) => llmSurface.readUrl(opts),
      renderMarkdown: (url) => this.readUrlRender(url),
      activity: this.surfaceActivity,
      log: this.controllerLog,
    });

    const search = new SearchSurface({
      hub: searchHub,
      settings: () => this.research.settings(),
      applyEnginePolicy: (effective) => this.research.applyEnginePolicy(effective),
      isCooling: (host) => this.research.isCooling(host),
      markCooldown: (host, reason) => this.research.markCooldown(host, reason),
      engineHost: (engine) => engineHost(engine, this.research.settings().urlTemplate),
      error: researchError,
      activity: this.surfaceActivity,
      log: this.controllerLog,
    });

    return { llm, search };
  }

  /** Crawl, topic research and the activity feed over the research session. */
  private createCrawlSurface(): CrawlSurface {
    return new CrawlSurface({
      researchLlm: () => this.researchLlmSurface,
      search: (query, opts) => this.searchHub.search(query, opts),
      settings: () => this.research.settings(),
      session: this.research,
      citation: () => this.researchView.citations,
      detachedView: () => this.researchView.detached,
      harvester: () => this.harvester,
      indexPage: (url, title, content) => cortex.indexPage(url, title, content),
      broadcast: (channel, payload) => this.broadcast(channel, payload),
      log: (level, message) => this.telemetry.addLog(level, message),
    });
  }
  /** Bounds of the browser viewport as actually laid out in the HUD (zoom-aware). */
  private async computeViewportBounds(): Promise<{ x: number; y: number; width: number; height: number }> {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return this.getViewportBounds();
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
    return this.getViewportBounds();
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
      allTabs: () => this.tabManager?.allTabs() ?? [],
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

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
    this.hil.manager.setWindow(win);
    this.hud.watch(win);
    if (!this.hudShortcutBound) {
      this.hudShortcutBound = true;
      win.webContents.on('before-input-event', (event, input) => {
        if (isTakeoverShortcut(input, process.platform)) {
          event.preventDefault();
          this.human.toggle();
        }
      });
    }
    this.trayManager = new TrayManager({
      mainWindow: win,
      closeToTrayDefault: false,
    });
    this.downloads.manager.attachToSession(win.webContents.session);
    this.downloads.manager.onDownloadComplete((record) => {
      this.telemetry.addLog('info', `Download Complete: "${record.filename}" (${record.totalBytes} bytes) saved to data/downloads/`);
      this.telemetry.emitSimpleEvent('harvest', `File Download Complete: ${record.filename}`);
    });
    this.setupTabManager();
    this.ipc = this.createIpcSurface();
    this.ipc.register();
    this.deck.setup();
  }

  public reassertViewport(): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      this.deck.position();
    } catch {
      // A settings surface can temporarily hide the sidebar.
    }
    this.tabManager?.updateActiveTabBounds();
    try {
      this.mainWindow.webContents.invalidate();
    } catch {
      // Window is closing.
    }
    for (const tab of this.tabManager?.allTabs() ?? []) {
      try {
        if (!tab.view.webContents.isDestroyed()) tab.view.webContents.invalidate();
      } catch {
        // Tab closed during the sweep.
      }
    }
  }

/** The deps both LlmSurface instances share: navigation, fingerprint UA and the log. */
  private llmSurfaceBase() {
    return {
      navigateForText: (url: string) => this.researchView.navigateForText(url),
      userAgent: this.hostProfile.userAgent,
      log: (level: 'info' | 'warn' | 'action', msg: string) => this.telemetry.addLog(level, msg),
    };
  }

  private setupTabManager(): void {
    if (!this.mainWindow) return;
    this.createViewportController();
    this.createTabManager();
  }

  private createViewportController(): void {
    this.viewportController = new ViewportController({
      store: new DeviceProfileStore(path.join(app.getPath('userData'), 'device-profiles.json')),
      available: () => this.getViewportBounds(),
      getTab: (tabId) => this.tabManager?.getTab(tabId) ?? null,
      getActiveTabId: () => this.tabManager?.getActiveTabId() ?? '',
      applyZoom: (wc) => this.applyZoom(wc),
      setInputScale: (wc, scale) => this.input.simulator.setViewportScale(wc, scale),
      relayout: () => this.tabManager?.updateActiveTabBounds(),
      broadcast: () => this.telemetry.broadcastState(),
      log: (level, message) => this.telemetry.addLog(level, message),
    });
  }

  private createTabManager(): void {
    const mainWindow = this.mainWindow;
    if (!mainWindow) return;
    this.tabManager = new TabManager({
      mainWindow,
      hostProfile: this.hostProfile,
      getViewportBounds: () => this.getViewportBounds(),
      getTabBounds: (tabId) =>
        this.viewportController?.frameFor(tabId, this.getViewportBounds()) ?? this.getViewportBounds(),
      applyZoom: (wc) => this.applyZoom(wc),
      onZoomShortcut: (action) => {
        this.zoom.setZoom({ action });
      },
      onTakeoverShortcut: () => this.human.toggle(),
      onRendererGone: this.tabEvents.onRendererGone,
      onTabUpdated: this.tabEvents.onTabUpdated,
      onTabsChanged: this.tabEvents.onTabsChanged,
      onTabCreated: this.tabEvents.onTabCreated,
      onViewAdded: () => this.deck.bringToFront(),
      onTabClosed: (tabId) => this.viewportController?.unregisterTab(tabId),
      onLog: (level, msg) => this.telemetry.addLog(level, msg),
      onConsoleLog: this.tabEvents.onConsoleLog,
    });

    this.telemetry.addLog('info', `Stealth Profile Active: Spoofing host ${this.hostProfile.name} v${this.hostProfile.version}`);

    // Create initial default tab
    this.tabManager.createTab('about:blank');

    mainWindow.on('resize', () => {
      this.deck.position();
      this.tabManager?.updateActiveTabBounds();
      this.viewportController?.scheduleRefresh();
    });
  }

  public getViewportBounds(): { x: number; y: number; width: number; height: number } {
    if (!this.mainWindow) return { x: 0, y: 0, width: 0, height: 0 };
    // Child-view bounds are relative to the content area (excluding the title
    // bar and menu), so size the page viewport from the content size.
    const [winWidth, winHeight] = this.mainWindow.getContentSize();
    const rightPanelWidth = this.deck.getMode() === 'docked' ? 420 : 0;
    // With tab bar, top bar height is 100px (64px navbar + 36px tab bar)
    const topBarHeight = 100;

    const viewportWidth = Math.max(400, winWidth - rightPanelWidth);
    const viewportHeight = Math.max(300, winHeight - topBarHeight);

    return {
      x: 0,
      y: topBarHeight,
      width: viewportWidth,
      height: viewportHeight,
    };
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
    onModeChanged: () => this.tabManager?.updateActiveTabBounds(),
    sendToShell: (channel, payload) => this.sendToShellWindow(channel, payload),
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
  private sendToShellWindow(channel: string, payload: unknown): void {    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }

  private sendToSurfaces(channel: string, payload: unknown): void {
    this.sendToShellWindow(channel, payload);
    const panel = this.deck.getView()?.webContents;
    if (panel && !panel.isDestroyed()) panel.send(channel, payload);
  }

  /** Broadcast an event to every render surface (shell and deck panel alike). */
  public broadcast(channel: string, payload?: unknown): void {
    this.sendToSurfaces(channel, payload);
  }

















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
  private requireTabManager(): NonNullable<BrowserChassis['tabManager']> {
    if (!this.tabManager) throw new Error('Browser Chassis uninitialized');
    return this.tabManager;
  }

  /** The tab manager; the bridge cannot reach a tab before the window exists. */
  get tabs(): TabManager {
    return this.requireTabManager();
  }

  /** The responsive viewport controller; available once the window is set. */
  get viewport(): ViewportController {
    if (!this.viewportController) throw new Error('Browser Chassis uninitialized');
    return this.viewportController;
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
    displayScale: () => this.getDisplayScale(),
    viewportState: () => this.viewportController?.state() ?? null,
    isEmulated: (wc) => Boolean(this.viewportController?.isEmulated(wc as any)),
    bounds: () => this.getViewportBounds(),
    webContentsList: () => (this.tabManager?.allTabs() ?? []).map((tab) => ({ webContents: tab.view.webContents })),
    onChanged: () => this.telemetry.broadcastState(),
  });


  /** Scale factor of the display containing the main window. */
  private getDisplayScale(): number {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        return screen.getDisplayMatching(this.mainWindow.getBounds()).scaleFactor || 1;
      }
    } catch {
      // Fall through to the primary display (window not created yet).
    }
    try {
      return screen.getPrimaryDisplay().scaleFactor || 1;
    } catch {
      // `screen` is unavailable before `app.whenReady`; assume unscaled.
      return 1;
    }
  }


  private applyZoom(wc: WebContents): void {
    this.zoom.applyTo(wc);
  }


  /**
   * Change page zoom for every tab.
   *
   * `mode` follows the human policy; `action` is a Chrome-like step; `factor`
   * is an exact zoom from an agent. An explicit change overrides the policy base
   * until `reset` or a mode switch.
   */

  /** The renderer IPC surface, wired to the chassis surfaces. */
  private createIpcSurface(): IpcSurface {
    return new IpcSurface({
      state: this.state,
      hud: this.hud,
      logs: () => this.telemetry.entries(),
      latestConstruct: () => this.latestConstruct,
      human: {
        takeOver: () => this.human.takeOver(),
        resume: () => this.human.resume(),
        status: () => this.human.status(),
      },
      nav: this.nav,
      activeWebContents: () => this.tabManager?.getActiveTab()?.view?.webContents ?? null,
      tabs: {
        summary: () => this.tabManager?.getTabsSummary() ?? [],
        create: (url) => this.tabOps.create(url),
        switchTo: (id) => this.tabOps.switchTo(id),
        close: (id) => this.tabOps.close(id),
      },
      zoom: this.zoom,
      viewport: this.viewport,
      deck: this.deck,
      toggleDevTools: () => this.tabOps.toggleDevTools(),
      setViewportVisibility: (visible) => {
        this.tabManager?.setViewportVisibility(visible);
        this.deck.setOverlayVisible(visible);
      },
      pageUrl: () => this.getPageInfo().url,
      send: (channel, payload) => this.sendToSurfaces(channel, payload),
      inputSetProfile: (profile) => this.input.simulator.setProfile(profile),
      harvestMarkdown: () => this.harvest.harvestMarkdown(),
      decisionsLog: () => this.decision.events(),
    });
  }

  /** The shared Cortex database (bookmarks, history, recall). */
  readonly cortex = cortex;

  public captureScreenshotJpeg(maxSide = 1400, quality = 82) {
    return captureScreenshotJpeg(
      {
        capturePage: () => this.harvest.capturePageWithRetry(this.getActiveWebContents(), this.getViewportBounds()),
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
  // The screenshots directory, retention, compositor retry and the encode/save/
  // telemetry tail live in ScreenshotStore.

  private readonly screenshotStore = new ScreenshotStore({
    log: this.controllerLog,
    telemetry: this.controllerTelemetry,
  });




  public getPageInfo() {
    return readPageInfo(this.state, this.tabManager?.getActiveTab() ?? null);
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
