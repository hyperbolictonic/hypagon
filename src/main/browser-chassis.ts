import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, ipcMain, clipboard, powerMonitor, screen, session, WebContentsView, type WebContents } from 'electron';
import type { AgentStatus, ChassisState, HarvestedConstruct, TelemetryEvent, TabSummary } from '../shared/types.js';
import { DeviceProfileStore } from './viewport/profiles.js';
import { ViewportController } from './viewport/controller.js';
import { ZoomController } from './zoom/controller.js';
import { loadInputProfile, saveInputProfile, type InputProfile } from './telemetry/input-profile.js';
import { InputSurface } from './input/input-surface.js';
import { TelemetrySurface } from './telemetry/telemetry-surface.js';
import { HumanActivityMonitor, humanListenerScript, type HumanActivity } from './input/human-activity.js';
import { NavigationSurface } from './navigation/navigation-surface.js';
import {
  COLLABORATION_CLASS_PREFIX,
  COLLABORATION_EXIT_PREFIX,
  COLLABORATION_NOTE_PREFIX,
  COLLABORATION_RESOLVE_PREFIX,
  collaborationPickerScript,
} from './collaboration/overlay.js';
import type { CollaborationTarget } from '../shared/collaboration.js';
import { bump } from './metrics.js';
import { ActionLedger } from './telemetry/action-ledger.js';
import { ConstructHarvester } from './harvester/markdown.js';
import { JevController } from './jev/controller.js';
import { DeckController } from './deck/controller.js';
import { HarvestSurface } from './harvest/harvest-surface.js';
import { readStoredDecisionConfig, saveDecisionConfig, decisionStatus, runDecision, onDecision, type DecisionEvent } from './decide/decision-client.js';
import { detectHostBrowserProfile, type HostBrowserProfile } from './telemetry/host-fingerprint.js';
import { TabManager, type TabInstance } from './tabs/tab-manager.js';
import { cortex, CortexDB } from './cortex/cortex-db.js';
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
import { researchError } from './research/session-controller.js';
import { ResearchViewSurface } from './research/research-view-surface.js';
import { ResearchSessionSurface } from './research/research-session-surface.js';
import { CrawlSurface } from './research/crawl-surface.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { HilSurface } from './hil/hil-surface.js';
import { JsonNavigator, type JsonQueryOptions, type JsonQueryResult } from './utils/json-navigator.js';
import { RenderedSnapshotEngine } from './snapshots/rendered-snapshot.js';
import { PrerenderEngine, type PrerenderOptions } from './prerender/prerender-engine.js';
import { isTakeoverShortcut } from './takeover-key.js';
import { LlmSurface } from './llm/llm-surface.js';
import { ReadSurface } from './llm/read-surface.js';
import { SearchHub, engineHost } from './search/search-engine.js';
import { SearchSurface } from './search/search-surface.js';
import { type CitationRelocation } from './research/anchors.js';


export class BrowserChassis {
  private mainWindow: BrowserWindow | null = null;
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
  private decisionLog: DecisionEvent[] = [];
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
  private hostProfile: HostBrowserProfile = detectHostBrowserProfile();
  private primitives!: Primitives;
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
  private humanMonitor = new HumanActivityMonitor();
  /** True while a person has explicitly taken control from the HUD. */
  private humanControl = false;
  private humanControlSince = 0;
  /** Throttle for the "human input detected while the bot has control" log line. */
  private lastHumanNoticeAt = 0;
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
  private onCollaborationNote?: (input: { target: CollaborationTarget; text: string; tags: string[] }) => void;
  /** Page zoom policy: fit the page to the OS display scale, or honour Windows scale. */
  /** Explicit zoom from the toolbar or an agent; null means use the policy base. */
  /** Global display/power listeners must be installed once, not per window. */
  private systemViewportListenersBound = false;
  /** Last proof that the HUD renderer is alive and painting. */
  private hudLastHeartbeat = Date.now();

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
  private targetConsoleLogs: Array<{ level: string; message: string; line: number; sourceId: string; timestamp: number }> = [];

  constructor() {
    this.subscribeToDecisions();
    this.page = this.createPageScriptSurface();
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
    this.hil = this.createInteractionSurfaces();
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
      this.decisionLog.push(event);
      if (this.decisionLog.length > 50) this.decisionLog.shift();
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
      markSynthetic: (at) => this.humanMonitor.markSynthetic(at),
      humanActive: () => this.isHumanActive(),
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
  private createInteractionSurfaces(): HilSurface {
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
    this.primitives = new Primitives({
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
      windowFocused: () => this.isWindowFocused(),
      recordTransition: (record) => this.actionLedger.record(record),
    });
    return hil;
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

    // A renderer can stop painting without exiting. If the HUD heartbeat goes
    // quiet while the window is visible, reload it once and repaint the views.
    setInterval(() => this.checkHudHealth(), 5000);
  }

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
    this.hudLastHeartbeat = Date.now();
    this.hil.manager.setWindow(win);
    this.bindViewportRecovery(win);
    if (!this.hudShortcutBound) {
      this.hudShortcutBound = true;
      win.webContents.on('before-input-event', (event, input) => {
        if (isTakeoverShortcut(input, process.platform)) {
          event.preventDefault();
          this.toggleHumanControl();
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
    this.registerIpcHandlers();
    this.deck.setup();
  }

  /**
   * A packaged window can come back from minimise/sleep with its native views
   * unpainted, which looks like a white browsing surface until the next resize.
   * Re-assert bounds and invalidate on every transition that can lose a frame.
   */
  private bindViewportRecovery(win: BrowserWindow): void {
    const reassert = () => this.reassertViewport();
    win.on('show', reassert);
    win.on('restore', reassert);
    win.on('focus', reassert);

    if (this.systemViewportListenersBound) return;
    this.systemViewportListenersBound = true;
    try {
      powerMonitor.on('resume', () => {
        this.hudLastHeartbeat = Date.now();
        reassert();
      });
    } catch {
      // Not available on every platform/test harness.
    }
    try {
      screen.on('display-metrics-changed', () => {
        this.zoom.applyToAllTabs();
        reassert();
      });
    } catch {
      // `screen` is unavailable before app.whenReady.
    }
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

  private checkHudHealth(): void {
    const win = this.mainWindow;
    if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) {
      this.hudLastHeartbeat = Date.now();
      return;
    }
    if (Date.now() - this.hudLastHeartbeat < 15_000) return;

    this.hudLastHeartbeat = Date.now();
    logMainEvent('hud-heartbeat-lost');
    try {
      win.webContents.reload();
    } catch {
      // Window is closing; nothing to recover.
    }
    this.reassertViewport();
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
      onTakeoverShortcut: () => this.toggleHumanControl(),
      onRendererGone: (tab, details) => this.handleRendererGone(tab, details),
      onTabUpdated: (tab) => this.handleTabUpdated(tab),
      onTabsChanged: (tabs) => this.handleTabsChanged(tabs),
      onTabCreated: (tab) => this.handleTabCreated(tab),
      onViewAdded: () => this.deck.bringToFront(),
      onTabClosed: (tabId) => this.viewportController?.unregisterTab(tabId),
      onLog: (level, msg) => this.telemetry.addLog(level, msg),
      onConsoleLog: (log) => this.handleConsoleLog(log),
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

  private handleRendererGone(tab: TabInstance, details: Electron.RenderProcessGoneDetails): void {
        logMainEvent('tab-renderer-gone', {
          tabId: tab.id,
          url: tab.url,
          reason: details.reason,
          exitCode: details.exitCode,
        });
        if (details.reason === 'clean-exit') return;
        setTimeout(() => {
          const live = this.tabManager?.allTabs().find((candidate) => candidate.id === tab.id);
          if (!live || live.view.webContents.isDestroyed()) return;
          try {
            live.view.webContents.reload();
          } catch {
            // The tab was closed while the renderer was restarting.
          }
          this.reassertViewport();
        }, 600);
  }

  private handleTabUpdated(tab: TabInstance): void {
        if (tab.id === this.tabManager?.getActiveTabId()) {
          this.state.currentUrl = tab.url;
          this.state.pageTitle = tab.title;
          this.state.isLoading = tab.isLoading;
          this.state.activeTabId = tab.id;
          this.telemetry.broadcastState();

          if (!tab.isLoading) this.bumpRevision();

          // Re-arm the takeover listener after every document (listeners die with the page).
          if (this.tabReadyForBackgroundWork(tab)) {
            void tab.view.webContents.executeJavaScript(humanListenerScript()).catch(() => null);
          }
          if (this.tabReadyForBackgroundWork(tab)) {
            this.harvest.indexTabQuietly(tab);
          }
        }
  }

  private handleTabsChanged(tabs: TabSummary[]): void {
        this.state.tabs = tabs;
        this.telemetry.broadcastState();
        this.trayManager?.updateStatus(this.state.agentStatus, tabs.length, !!this.hil.manager.getActiveRequest());
        this.sendToSurfaces('chassis:tabs-updated', tabs);
  }

  private handleTabCreated(tab: TabInstance): void {
        this.network.manager.attach(tab.view.webContents);
        this.viewportController?.registerTab(tab);
        // A tab created while force-open is armed must be patched *before* its document runs.
        // onTabCreated fires before the first load, but CDP arming is async; if the first document
        // already started, reload once so the patch is actually present.
        void this.shadow.syncForceOpen(tab.view.webContents).then((result) => {
          if (result.changed && result.armed && !tab.view.webContents.isDestroyed()) {
            setTimeout(() => {
              try {
                tab.view.webContents.reload();
              } catch {}
            }, 60);
          }
        });
  }

  private handleConsoleLog(log: { level: string; message: string; line: number; sourceId: string; timestamp: number }): void {
        this.targetConsoleLogs.push(log);
        if (this.targetConsoleLogs.length > 200) this.targetConsoleLogs.shift();
        // Takeover channel: the page reports trusted pointer/key/wheel activity with a magic prefix.
        const human = this.humanMonitor.ingest(log.message);
        if (human) this.noteHumanInput(human);
        if (log.message === COLLABORATION_EXIT_PREFIX) {
          this.deck.setCollabMode(false);
        }
        if (log.message.startsWith(COLLABORATION_RESOLVE_PREFIX)) {
          try {
            const payload = JSON.parse(log.message.slice(COLLABORATION_RESOLVE_PREFIX.length));
            if (typeof payload?.id === 'string') void this.deck.resolveNote(payload.id);
          } catch {
            this.telemetry.addLog('warn', 'Collaboration note resolve signal was invalid.');
          }
        }
        if (log.message.startsWith(COLLABORATION_NOTE_PREFIX)) {
          try {
            const note = JSON.parse(log.message.slice(COLLABORATION_NOTE_PREFIX.length));
            if (note?.target && typeof note.text === 'string') {
              this.onCollaborationNote?.({
                target: note.target,
                text: note.text,
                tags: Array.isArray(note.tags) ? note.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
              });
            }
          } catch {}
        }
        if (log.message.startsWith(COLLABORATION_CLASS_PREFIX)) {
          try {
            const edit = JSON.parse(log.message.slice(COLLABORATION_CLASS_PREFIX.length));
            if (edit?.target) {
              this.deck.forwardClassEdit(
                edit.target,
                Array.isArray(edit.added) ? edit.added.map(String) : [],
                Array.isArray(edit.removed) ? edit.removed.map(String) : [],
              );
            }
          } catch {}
        }
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
    stopSelection: () => this.stopCollaborationSelection(),
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
/** A loaded, real-URL tab is ready for background work (listener re-arm, quiet indexing). */
  private tabReadyForBackgroundWork(tab: { isLoading: boolean; url?: string }): boolean {
    return !tab.isLoading && Boolean(tab.url) && !tab.url!.startsWith('mark-eleven:') && tab.url !== 'about:blank';
  }

    /** The tab-op prologue: the manager, the directive log and the JEV purge. */
  private beginTabOperation(directive: string): NonNullable<BrowserChassis['tabManager']> {
    const tabManager = this.requireTabManager();
    this.telemetry.addLog('action', directive);
    this.purgeJevDepthStore();
    return tabManager;
  }

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

  // Tab Operations
  public createTab(url?: string): TabSummary {
    this.purgeJevDepthStore();
    const tab = this.requireTabManager().createTab(url);
    this.telemetry.addLog('action', `MCP Directive: new_tab(${url || 'about:blank'})`);
    // A tab opened directly at a URL is a navigation too: arm the same late-consent sweep, or a
    // cookie wall on a freshly opened tab would never be dismissed.
    if (url && /^https?:/i.test(url)) this.consent.scheduleSweep();
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      isLoading: tab.isLoading,
      isActive: true,
    };
  }

  public switchTab(tabId: string): void {
    const tabManager = this.beginTabOperation(`MCP Directive: switch_tab(${tabId})`);
    tabManager.switchTab(tabId);
    void this.viewportController?.refreshActive();
  }

  public closeTab(tabId?: string): void {
    const tabManager = this.beginTabOperation(`MCP Directive: close_tab(${tabId || 'active'})`);
    tabManager.closeTab(tabId);
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


  /** Open or close the native Chromium DevTools for the active tab. */
  public toggleDevTools(): boolean {
    try {
      const wc = this.getActiveWebContents();
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
        return false;
      }
      wc.openDevTools({ mode: 'detach' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Change page zoom for every tab.
   *
   * `mode` follows the human policy; `action` is a Chrome-like step; `factor`
   * is an exact zoom from an agent. An explicit change overrides the policy base
   * until `reset` or a mode switch.
   */

  private registerIpcHandlers() {
    this.registerCoreIpc();
    this.registerTabViewportIpc();
    this.registerDeckIpc();
    this.registerCortexIpc();
    this.registerSettingsIpc();
  }

  private registerCoreIpc() {
    ipcMain.on('chassis:hud-heartbeat', () => {
      this.hudLastHeartbeat = Date.now();
    });
    ipcMain.handle('chassis:get-state', () => this.state);
    ipcMain.handle('chassis:get-latest-construct', () => this.latestConstruct);
    ipcMain.handle('chassis:get-logs', () => this.telemetry.entries());
    ipcMain.handle('chassis:take-over-human', () => this.takeOverHuman());
    ipcMain.handle('chassis:resume-human', () => this.resumeHuman());
    ipcMain.handle('chassis:get-human-status', () => this.getHumanStatus());

    ipcMain.handle('chassis:navigate', async (_, url: string) => {
      await this.nav.navigateTo(url);
      return { success: true };
    });

    // Toolbar history controls. These are the same entry points the MCP `navigate_history` tool and
    // the right-click menu use, so a human and an agent cannot drift apart.
    ipcMain.handle('chassis:go-back', async () => ({ message: await this.nav.goBack() }));
    ipcMain.handle('chassis:go-forward', async () => ({ message: await this.nav.goForward() }));
    ipcMain.handle('chassis:reload', async () => ({ message: await this.nav.reload() }));
    ipcMain.handle('chassis:get-nav-state', () => {
      const wc = this.tabManager?.getActiveTab()?.view?.webContents;
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
      if (result.ok) this.input.simulator.setProfile(result.profile);
      return result;
    });

    ipcMain.handle('chassis:harvest', async () => {
      return await this.harvest.harvestMarkdown();
    });

  }

  private registerTabViewportIpc() {
    // Tab IPC Handlers
    ipcMain.handle('chassis:get-tabs', () => this.tabs.getTabsSummary());
    ipcMain.handle('chassis:create-tab', (_, url?: string) => this.createTab(url));
    ipcMain.handle('chassis:switch-tab', (_, tabId: string) => this.switchTab(tabId));
    ipcMain.handle('chassis:close-tab', (_, tabId?: string) => this.closeTab(tabId));

    // Page zoom: a runtime view control. The persisted mode is written from the
    // main process IPC handler (`chassis:zoom:mode`) so the bridge cannot change
    // a human setting by accident.
    ipcMain.handle('chassis:zoom:get', () => this.zoom.getState());
    ipcMain.handle('chassis:zoom:set', (_, input: { action?: 'status' | 'in' | 'out' | 'reset'; factor?: number } = {}) =>
      this.zoom.setZoom(input),
    );

    // Responsive device emulation. The agent path is intentionally tiny (status/set/reset);
    // profile management is a human-only convenience.
    ipcMain.handle('chassis:viewport:get', () => this.viewport.state());
    ipcMain.handle('chassis:viewport:set', (_, input: Parameters<ViewportController['set']>[0] = {}) =>
      this.viewport.set(input),
    );
    ipcMain.handle('chassis:viewport:reset', () => this.viewport.reset());
    ipcMain.handle('viewport:profile:save', (_, input: { name?: unknown; spec?: unknown }) =>
      this.viewport.saveProfile(input ?? {}),
    );
    ipcMain.handle('viewport:profile:delete', (_, id: unknown) => this.viewport.deleteProfile(id));
    ipcMain.handle('chassis:devtools:open', () => this.toggleDevTools());

    const setVisibility = (_: any, visible: boolean) => {
      this.tabManager?.setViewportVisibility(visible);
      this.deck.setOverlayVisible(visible);
    };

    ipcMain.handle('chassis:set-viewport-visibility', setVisibility);
    ipcMain.on('chassis:set-viewport-visibility', setVisibility);

  }

  private registerDeckIpc() {
    ipcMain.handle('chassis:get-sidebar-mode', () => this.deck.getMode());
    ipcMain.handle('chassis:get-sidebar-state', () => this.deck.surfaceState());
    // TEMP instrumentation: live bounds for verifying collab-mode geometry.
    ipcMain.handle('chassis:get-sidebar-bounds', () => this.deck.getView()?.getBounds() ?? null);
    ipcMain.on('chassis:set-sidebar-mode', (_: any, mode: 'docked' | 'floating' | 'collapsed') =>
      this.deck.setMode(mode),
    );
    ipcMain.on('chassis:toggle-sidebar-mode', () => this.deck.toggleMode());

    // Orb drag choreography (only meaningful while collapsed).
    ipcMain.on('chassis:set-sidebar-orb-edge', (_: any, edge: 'left' | 'right') => this.deck.setOrbEdge(edge));
    // Live drag: forward pointer deltas, clamped inside the content area.
    ipcMain.on('chassis:orbit-drag', (_: any, delta: { dx: number; dy: number }) => this.deck.dragOrb(delta));
    ipcMain.on('chassis:orbit-drag-end', () => this.deck.endOrbDrag());

    // Collab mode: toolbar pill, note cycling, concise list.
    ipcMain.on('chassis:set-collab-mode', (_: any, open: boolean) => this.deck.setCollabMode(Boolean(open)));
    ipcMain.on('chassis:collab-escape', () => this.deck.exitCollabUi());
    ipcMain.on('chassis:collab-navigate', (_: any, delta: number) => this.deck.navigate(delta));
    ipcMain.on('chassis:collab-toggle-list', (_: any, anchor?: { x: number; y: number; width: number; height: number }) =>
      this.deck.toggleList(anchor));

  }

  private registerCortexIpc() {
    // Cortex & Bookmarks IPC Handlers
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

  private registerSettingsIpc() {
    // Settings → decision model (optional). The renderer reads/writes data/decision.json through
    // these; the same file the bridge and the MCP server read, so there is one source of truth.
    ipcMain.handle('settings:get-decision', async () => ({
      stored: readStoredDecisionConfig(),
      status: decisionStatus(),
    }));
    ipcMain.handle('settings:save-decision', async (_, config: any) => {
      const result = await saveDecisionConfig(config);
      this.sendToSurfaces('chassis:decision-status', decisionStatus());
      return result;
    });
    ipcMain.handle('chassis:get-decisions', async () => this.decisionLog);
    // Reliable text copy for the HUD: selecting text inside a WebContentsView shell is not always
    // possible, and the clipboard is async in Electron 44.
    ipcMain.handle('app:copy-text', async (_, text: string) => {
      await clipboard.writeText(String(text ?? ''));
      return { ok: true };
    });
    ipcMain.handle('settings:test-decision', async () => {
      const started = Date.now();
      const result = await runDecision({
        state: { page: this.getPageInfo().url, note: 'connectivity probe from the Settings tab' },
        questions: { reachable: { type: 'noul', instructions: 'Is this a page URL?' } },
      });
      return { ...result, totalMs: Date.now() - started };
    });
  }

  public getCortex(): CortexDB {
    return cortex;
  }

  /**
   * Capture the visible viewport as a baseline JPEG inside TypeSafe's image limits (longest side
   * ≤ 1568, shortest ≥ 280). Used by `decide(include_screenshot)` so the model can see the page.
   */
  public async captureScreenshotJpeg(maxSide = 1400, quality = 82): Promise<{ base64: string; width: number; height: number } | null> {
    try {
      const wc = this.getActiveWebContents();
      const image = await this.harvest.capturePageWithRetry(wc, this.getViewportBounds());
      if (!image || image.isEmpty()) return null;
      const size = image.getSize();
      if (!size.width || !size.height) return null;

      const shrink = Math.min(1, maxSide / Math.max(size.width, size.height));
      let out = shrink < 1
        ? image.resize({ width: Math.round(size.width * shrink), height: Math.round(size.height * shrink), quality: 'good' })
        : image;

      const after = out.getSize();
      const smallest = Math.min(after.width, after.height);
      if (smallest > 0 && smallest < 280) {
        const grow = 280 / smallest;
        out = out.resize({ width: Math.round(after.width * grow), height: Math.round(after.height * grow), quality: 'good' });
      }

      const final = out.getSize();
      const buffer = out.toJPEG(quality);
      return { base64: buffer.toString('base64'), width: final.width, height: final.height };
    } catch (err: any) {
      this.telemetry.addLog('warn', `Screenshot capture failed: ${err?.message || err}`);
      return null;
    }
  }

  /**
   * A sensitive gate needs a person. Raise the hand-off from Kuang itself rather than relying on the
   * caller to do it: the rule already decided that a human is required, so waiting for another round
   * trip only wastes the agent's turn. Throttled per URL, and skipped while a request is already open.
   */
  public async requestHumanForGate(gate: { kind?: string; reason: string; evidence?: string[] }, url?: string): Promise<void> {
    // Only one request at a time: while one is open the human is already being asked. Once it is
    // resolved, a fresh gate may ask again — that is the correct behaviour, not spam, because the
    // human explicitly cleared the previous request.
    if (this.hil.manager.getActiveRequest()) return;
    const pageUrl = url || this.getPageInfo().url;
    const detail = gate.evidence && gate.evidence.length ? ` — matched: ${gate.evidence.join(' | ')}` : '';
    await this.hil.request(`${gate.reason}${detail}`, { url: pageUrl, bringToFront: true }).catch(() => null);
  }

  /** Recent decision-model calls, for `GET /decisions` and the HUD's DECISIONS tab. */
  public getDecisionEvents(): DecisionEvent[] {
    return this.decisionLog;
  }

  // ---- human takeover ------------------------------------------------------

  /**
   * Explicit human control.
   *
   * Page events are never used to seize control: a synthetic CDP click and a real one look the
   * same to the DOM, and renderer latency previously made the gateway pause itself. The human
   * asks for control from the HUD (or `POST /human/takeover`); until then the bot owns input.
   */
  public isHumanActive(): boolean {
    return this.humanControl;
  }

  public getHumanStatus(): { active: boolean; activeForMs: number; last: HumanActivity | null } {
    return {
      active: this.humanControl,
      activeForMs: this.humanControl ? Date.now() - this.humanControlSince : 0,
      last: this.humanMonitor.getLastHuman(),
    };
  }

  /** Give a person the wheel until they explicitly resume the agent. */
  public takeOverHuman(): { control: 'human' } {
    this.humanControl = true;
    this.humanControlSince = Date.now();
    this.state.agentStatus = 'HUMAN_INPUT';
    this.state.activeAction = 'Human control — agent paused';
    this.telemetry.broadcastState();
    this.telemetry.addLog('warn', 'Human took control — synthetic input paused.');
    try {
      const wc = this.getActiveWebContents();
      this.mainWindow?.focus();
      wc.focus();
    } catch {
      /* window/tab closing */
    }
    return { control: 'human' };
  }

  /** Ctrl+Shift+Space: take control, or hand it back if already human. */
  public toggleHumanControl(): { control: 'bot' | 'human' } {
    if (this.humanControl) {
      this.resumeHuman();
      return { control: 'bot' };
    }
    this.takeOverHuman();
    return { control: 'human' };
  }

  public setOnCollaborationNote(
    callback: (input: { target: CollaborationTarget; text: string; tags: string[] }) => void,
  ): void {
    this.onCollaborationNote = callback;
  }

  /** Start the human element picker and resolve with its selected target. */
  public async pickCollaborationTarget(): Promise<CollaborationTarget | null> {
    const wc = this.getActiveWebContents();
    return await wc
      .executeJavaScript(collaborationPickerScript({ rightInset: this.deck.pageInset() }))
      .catch(() => null);
  }

  public async stopCollaborationSelection(): Promise<void> {
    try {
      const wc = this.getActiveWebContents();
      await wc.executeJavaScript(`
        (() => {
          if (typeof window.__kuangCollabPickerCancel === 'function') window.__kuangCollabPickerCancel();
          if (typeof window.__kuangCollabSelectionCancel === 'function') window.__kuangCollabSelectionCancel();
          const el = document.getElementById('__kuang_collab_picker');
          if (el) el.remove();
          const selected = document.getElementById('__kuang_collab_selection');
          if (selected) selected.remove();
          window.__kuangCollabPicking = false;
        })()
      `);
    } catch {}
  }

  /** Hand control back to the agent. */
  public resumeHuman(): { resumed: boolean } {
    const wasHuman = this.humanControl;
    this.humanControl = false;
    this.humanControlSince = 0;
    if (this.state.agentStatus === 'HUMAN_INPUT') {
      this.state.agentStatus = 'IDLE';
      this.state.activeAction = 'Human handed back control';
      this.telemetry.broadcastState();
    }
    if (wasHuman) this.telemetry.addLog('info', 'Human handed control back — agent may act again.');
    return { resumed: true };
  }

  /**
   * Record human page activity for telemetry and the HUD, but never pause the bot.
   *
   * Control only moves through `takeOverHuman()`. A note here is informational: the person can
   * click TAKE OVER if they want the wheel. This is what removes the synthetic-vs-human race.
   */
  private noteHumanInput(activity: HumanActivity): void {
    if (activity.url && this.state.currentUrl && activity.url !== this.state.currentUrl) return; // stale tab
    this.telemetry.emitTelemetry({
      type: 'click',
      timestamp: activity.at,
      details: `HUMAN ${activity.kind}${activity.target ? ` on ${activity.target}` : ''} — agent still has control`,
    });
    if (this.humanControl) return;
    const now = Date.now();
    if (now - this.lastHumanNoticeAt < 10_000) return;
    this.lastHumanNoticeAt = now;
    this.telemetry.addLog(
      'info',
      `Human input detected (${activity.kind}${activity.target ? `: ${activity.target}` : ''}) — agent still has control; click TAKE OVER to pause.`,
    );
  }

  /**
   * A guarded decision that cannot clear its threshold is a HUMAN decision, not an agent guess.
   * Raise the HIL banner (with the options) and hand the caller a `human_required` result so it
   * stops instead of acting on a coin flip. Non-blocking: the request is registered synchronously,
   * and the promise is left to resolve when the person acts or the request times out.
   */
  public requestHumanForDecision(
    info: { question?: string; options?: string[]; confidence?: number; reasons?: string[] },
    url?: string
  ): string | null {
    const existing = this.hil.manager.getActiveRequest();
    if (existing) return existing.id; // already asking the human; do not stack requests

    const pageUrl = url || this.getPageInfo().url;
    const options = (info.options || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
    const bits = [
      info.question ? `Decision needed: ${info.question}` : 'Decision needed',
      options.length ? `Options: ${options.map((o) => `"${o}"`).join(', ')}` : '',
      typeof info.confidence === 'number' ? `(model confidence ${info.confidence.toFixed(2)})` : '',
      info.reasons?.length ? `— ${info.reasons.slice(0, 2).join('; ')}` : '',
    ].filter(Boolean);
    const reason = bits.join(' ').slice(0, 400);

    const pending = this.hil.request(reason, { url: pageUrl, bringToFront: true, timeoutSeconds: 300 });
    const id = this.hil.manager.getActiveRequest()?.id ?? null;
    void pending.catch(() => null); // resolves when the human acts; we do not block the HTTP call
    return id;
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




  public getPageInfo(): { url: string; title: string; isLoading: boolean; activeTabId?: string } {
    // Read the live document URL/title. Reddit (and most SPAs) navigate with pushState, which fires
    // no did-navigate event — the cached tab URL then stays stale and an `act` delta reports
    // urlChanged:false for a click that actually worked.
    let url = this.state.currentUrl;
    let title = this.state.pageTitle;
    try {
      const active = this.tabManager?.getActiveTab();
      const live = active?.view?.webContents;
      if (live && !live.isDestroyed()) {
        const liveUrl = live.getURL();
        const liveTitle = live.getTitle();
        if (liveUrl) url = liveUrl;
        if (liveTitle) title = liveTitle;
        // Keep the tab bar's cached values in step with what the page actually is.
        if (active.url !== url) active.url = url;
        if (active.title !== title) active.title = title;
      }
    } catch {
      // No active tab yet — fall back to the cached state.
    }
    return {
      url,
      title,
      isLoading: this.state.isLoading,
      activeTabId: this.state.activeTabId,
    };
  }

  public getTargetConsoleLogs(limit: number = 50) {
    return this.targetConsoleLogs.slice(-limit);
  }

  public getFingerprintProfile(): HostBrowserProfile {
    return this.hostProfile;
  }

  public queryJsonData(params: {
    source: 'network_payload' | 'stream_messages' | 'download_file' | 'inline_json';
    sourceId?: string;
    jsonString?: string;
    path?: string;
    view?: 'value' | 'schema' | 'keys' | 'summary';
    limit?: number;
    maxStringLength?: number;
    filterPredicate?: string;
  }): JsonQueryResult {
    this.telemetry.addLog('action', `MCP Directive: query_json_data(${params.source}${params.sourceId ? `:${params.sourceId}` : ''}, view=${params.view || 'value'})`);

    let targetData: any = null;

    switch (params.source) {
      case 'network_payload': {
        if (!params.sourceId) throw new Error('Missing "sourceId" (requestId) for source "network_payload"');
        const payload = this.network.manager.getPayload(params.sourceId);
        targetData = payload.data;
        break;
      }

      case 'stream_messages': {
        const messages = this.network.manager.getStreamMessages({
          streamId: params.sourceId,
          limit: params.limit || 50,
        });
        targetData = messages.map(m => m.jsonData !== undefined ? m.jsonData : m.data);
        break;
      }

      case 'download_file': {
        if (!params.sourceId) throw new Error('Missing "sourceId" (filename) for source "download_file"');
        const downloadsDir = dataPath('downloads');
        const filePath = path.join(downloadsDir, path.basename(params.sourceId));
        if (!fs.existsSync(filePath)) {
          throw new Error(`Downloaded file not found: ${params.sourceId}`);
        }
        const raw = fs.readFileSync(filePath, 'utf8');
        try {
          targetData = JSON.parse(raw);
        } catch {
          targetData = raw;
        }
        break;
      }

      case 'inline_json': {
        const raw = params.jsonString || params.sourceId;
        if (!raw) throw new Error('Missing "jsonString" or raw json in "sourceId" for source "inline_json"');
        try {
          targetData = typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch (e: any) {
          throw new Error(`Invalid inline JSON provided: ${e.message}`);
        }
        break;
      }

      default:
        throw new Error(`Unsupported source: ${params.source}`);
    }

    return JsonNavigator.query(targetData, {
      path: params.path,
      view: params.view,
      limit: params.limit,
      maxStringLength: params.maxStringLength,
      filterPredicate: params.filterPredicate,
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

  // System Tray & Window Visibility
  public setWindowVisibility(visible: boolean): void {
    if (visible) {
      this.trayManager?.showWindow();
    } else {
      this.trayManager?.hideWindow();
    }
  }

  public isWindowVisible(): boolean {
    return this.trayManager ? this.trayManager.isWindowVisible() : true;
  }

  /** True when the app window currently owns OS focus (required for synthetic input). */
  public isWindowFocused(): boolean {
    try {
      return Boolean(this.mainWindow && !this.mainWindow.isDestroyed() && this.mainWindow.isFocused());
    } catch {
      return false;
    }
  }

  /** Brings the app window to the foreground (best effort). */
  public focusWindow(): boolean {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        if (!this.mainWindow.isVisible()) this.trayManager?.showWindow();
        this.mainWindow.show();
        this.mainWindow.focus();
        this.mainWindow.moveTop();
      }
    } catch {}
    return this.isWindowFocused();
  }

  public setCloseToTray(enabled: boolean): void {
    this.trayManager?.setCloseToTray(enabled);
  }

  public isCloseToTray(): boolean {
    return this.trayManager ? this.trayManager.isCloseToTray() : true;
  }

  // ---- Primitives layer (observe / act / wait / extract / collect / find) ----

  public getPrimitives(): Primitives {
    return this.primitives;
  }

  public getRevision(): number {
    return this.revision;
  }

  public bumpRevision(): number {
    return ++this.revision;
  }

  /** Advertised capability surface for `bridge_health`. */
  public getCapabilities(): string[] {
    return [
      'observe:v2',
      'wait_for',
      'extract:list,table,app_data',
      'collect_all',
      'find',
      'expect',
      'act',
      'page_state',
      'diff',
      'network_since',
      'export_har',
      'contexts',
      'marks_offscreen',
      'llm_surface',
      'llm_fetch',
      'read_url',
      'search_web',
      'deep_crawl',
      'research_topic',
      'zoom',
    ];
  }
}
