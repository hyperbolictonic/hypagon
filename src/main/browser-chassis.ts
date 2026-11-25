import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, app, nativeImage, ipcMain, clipboard, powerMonitor, screen, session, WebContentsView, type Session, type WebContents } from 'electron';
import type { AgentStatus, ChassisState, HarvestedConstruct, TelemetryEvent, TabSummary } from '../shared/types.js';
import type { ViewportState } from '../shared/viewport.js';
import { DeviceProfileStore } from './viewport/profiles.js';
import { ViewportController } from './viewport/controller.js';
import type { ZoomMode, ZoomSettings, ZoomState } from '../shared/zoom.js';
import { ZoomController } from './zoom/controller.js';
import { HumanizedInputSimulator } from './telemetry/input-simulator.js';
import { loadInputProfile, saveInputProfile, type InputProfile } from './telemetry/input-profile.js';
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
import { fetchStatic } from './network/impersonate.js';
import { JevController } from './jev/controller.js';
import { DeckController } from './deck/controller.js';
import { HarvestSurface } from './harvest/harvest-surface.js';
import { readStoredDecisionConfig, saveDecisionConfig, decisionStatus, runDecision, onDecision, type DecisionEvent } from './decide/decision-client.js';
import { DEEP_DOM_HELPERS } from './primitives/dom-targeting.js';
import { InputActionsController } from './input-actions.js';
import { detectHostBrowserProfile, type HostBrowserProfile } from './telemetry/host-fingerprint.js';
import { TabManager, type TabInstance } from './tabs/tab-manager.js';
import { cortex, CortexDB } from './cortex/cortex-db.js';
import { DownloadManager, type DownloadRecord } from './downloads/download-manager.js';
import { ShieldBreaker, type ConsentPolicy } from './shield/shield-breaker.js';
import { ConsentController } from './shield/consent-controller.js';
import { evaluateInFrames, type FrameEvalOptions, type FrameEvalResult } from './browser/frame-eval.js';
import { listFrames, type FrameInfo } from './browser/frames.js';
import { resolveFrameMark } from './browser/frame-marks.js';
import { inventoryFrames, type FrameInventoryResult } from './browser/frames-inventory.js';
import { runTabWalk, type TabWalkOptions, type TabWalkResult } from './shadow-walk/tab-walk.js';
import { resolveSealedToken as resolveSealedTarget } from './shadow-walk/sealed-targets.js';
import { ScreenshotStore, type ScreenshotPayload } from './harvest/screenshots.js';
import { loadShadowWalkSettings, shadowWalkRefusal, type ShadowWalkSurface } from './shadow-walk/settings.js';
import {
  syncForceOpen,
  isForceOpenArmed,
  detectForceOpen,
  type ForceOpenDetection,
} from './shadow-walk/force-open.js';
import { controlFactsExpression, parseControlFacts, type ControlFacts, type ControlFactsOptions } from './primitives/control-facts.js';
import { dataPath } from './data-paths.js';
import { logMainEvent } from './diagnostics/main-log.js';
import { SessionVault, type SessionSnapshot } from './session/session-vault.js';
import {
  NetworkInterceptor,
  type CapturedNetworkRequest,
  type NetworkFilter,
  type RealtimeStream,
  type StreamMessage,
} from './network/network-interceptor.js';
import { MarksOverlay, type MarkItem } from './marks/marks-overlay.js';
import { MarksSurface } from './marks/marks-surface.js';
import { Primitives } from './primitives/primitives.js';
import { ScriptVault } from './scripts/script-vault.js';
import type { ScriptItem } from './cortex/cortex-db.js';
import { TrayManager } from './tray/tray-manager.js';
import { looksLikeChallenge, type ResearchSettings } from './research/settings.js';
import { researchError, ResearchSessionController } from './research/session-controller.js';
import { DetachedViewController } from './research/detached-view.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { HilManager, type HilRequest, type HilResolution, type NotificationOptions } from './hil/hil-manager.js';
import {
  generateChaosTrajectory,
  type ChaosKinematicsOptions,
  type PathStep,
} from './telemetry/chaos-kinematics.js';
import { JsonNavigator, type JsonQueryOptions, type JsonQueryResult } from './utils/json-navigator.js';
import { RenderedSnapshotEngine } from './snapshots/rendered-snapshot.js';
import { PrerenderEngine, type PrerenderOptions } from './prerender/prerender-engine.js';
import { isTakeoverShortcut } from './takeover-key.js';
import { LlmSurface } from './llm/llm-surface.js';
import { ReadSurface } from './llm/read-surface.js';
import { SearchHub } from './search/search-engine.js';
import { SearchSurface } from './search/search-surface.js';
import { Crawler, type CrawlOptions, type CrawlOutcome, type HumanAssistInfo } from './crawl/crawler.js';
import { type CitationAnchor, type CitationRelocation } from './research/anchors.js';
import { CitationController, type HumanHandoffResult, type RevalidationSummary } from './research/citation-controller.js';
import { CrawlOrchestrator, type RenderCrawlOptions, type RenderCrawlResult } from './research/crawl-orchestrator.js';
import { Researcher, type ResearchOptions, type ResearchOutcome } from './research/researcher.js';

/** The viewport profile endpoints' shared result shape. */
type ViewportProfileResult = {
  ok: boolean;
  profiles: ReturnType<ViewportController['profiles']>;
};


export class BrowserChassis {
  private mainWindow: BrowserWindow | null = null;
  /** Shared controller hooks: every controller config wires the same log and telemetry. */
  private readonly controllerLog = (level: 'info' | 'warn' | 'action', message: string): void => this.addLog(level, message);
  private readonly controllerTelemetry = (event: TelemetryEvent): void => this.emitTelemetry(event);
  /** The research activity feed hook shared by the read/search surfaces. */
  private readonly surfaceActivity = <T>(
    tool: string,
    summary: string,
    describe: (result: T) => string,
    run: () => Promise<T>,
  ): Promise<T> => this.withResearchActivity(tool, summary, describe, run);
  /** Recent decision-model calls, mirrored to the HUD (newest last, capped at 50). */
  private decisionLog: DecisionEvent[] = [];
  /** Throttle for gate-triggered human hand-offs (one per URL per few minutes). */
  private lastGateHil: { url: string; at: number } | null = null;
  private tabManager: TabManager | null = null;
  private simulator: HumanizedInputSimulator;
  private harvester: ConstructHarvester;
  /** JEV page compaction: surface index + in-memory depth store. */
  private shieldBreaker: ShieldBreaker;
  private downloadManager: DownloadManager;
  private sessionVault: SessionVault;
  private networkInterceptor: NetworkInterceptor;
  private marksOverlay: MarksOverlay;
  readonly marks: MarksSurface;
  readonly harvest: HarvestSurface;
  readonly nav: NavigationSurface;
  private scriptVault: ScriptVault;
  private trayManager: TrayManager | null = null;
  private hilManager: HilManager;
  private prerenderEngine: PrerenderEngine;
  private hostProfile: HostBrowserProfile = detectHostBrowserProfile();
  private primitives: Primitives;
  private llmSurface: LlmSurface;
  private researchLlmSurface: LlmSurface;
  private searchHub: SearchHub;
  /** The agent-facing read/search adapters; the transports stay private. */
  readonly llm: ReadSurface;
  readonly search: SearchSurface;
  private crawler: Crawler;
  private researcher: Researcher;
  private actionLedger: ActionLedger;
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

  private latestConstruct: HarvestedConstruct | null = null;
  private logs: Array<{ id: string; time: string; level: 'info' | 'warn' | 'action'; message: string }> = [];
  private targetConsoleLogs: Array<{ level: string; message: string; line: number; sourceId: string; timestamp: number }> = [];

  constructor() {
    // Mirror every decision call into the HUD's DECISIONS tab. The listener is passive: it cannot
    // delay or fail a decision (see emitDecision), and the ring buffer lets a late-joining renderer
    // catch up.
    onDecision((event) => {
      this.decisionLog.push(event);
      if (this.decisionLog.length > 50) this.decisionLog.shift();
      this.sendToSurfaces('chassis:decision', event);
    });

    this.harvester = new ConstructHarvester();
    this.simulator = new HumanizedInputSimulator({
      onMouseMove: (point, velocity) => {
        this.state.cursor = point;
        this.emitPointEvent('mouse_move', point, `Velocity: ${velocity.toFixed(2)} px/ms`);
      },
      onClick: (point) => {
        this.state.stats.totalInteractions++;
        this.emitPointEvent('click', point, 'Physical mouse switch actuated');
      },
      onKey: (char, delay) => {
        this.state.stats.totalInteractions++;
        this.emitTelemetry({
          type: 'keystroke',
          key: char === ' ' ? 'SPACE' : char,
          durationMs: delay,
          timestamp: Date.now(),
          details: `Cadence variance: ${delay}ms`,
        });
      },
      onScroll: (deltaY) => {
        this.emitSimpleEvent('scroll', `Mousewheel impulse: ${deltaY}px`);
      },
    });

    // Human pacing knobs (Settings → INPUT); loaded once at boot, updated live over IPC.
    this.simulator.setProfile(loadInputProfile());
    // Takeover arbitration: every synthetic dispatch is stamped so the monitor can tell our input
    // from the person's, and the gate refuses input while the human has the wheel.
    this.simulator.setSyntheticMarker((at) => this.humanMonitor.markSynthetic(at));
    this.simulator.setHumanGate(() => this.isHumanActive());

    this.shieldBreaker = new ShieldBreaker(this.simulator);
    this.downloadManager = new DownloadManager();
    this.sessionVault = new SessionVault();
    this.networkInterceptor = new NetworkInterceptor();
    this.marksOverlay = new MarksOverlay();
    this.marks = new MarksSurface({
      activeWebContents: () => this.getActiveWebContents(),
      revision: () => this.revision,
      marksOverlay: this.marksOverlay,
      refuseShadow: (surface) => this.refuseShadow(surface),
      log: this.controllerLog,
    });
    this.harvest = new HarvestSurface({
      activeWebContents: () => this.getActiveWebContents(),
      viewportBounds: () => this.getViewportBounds(),
      zoomState: () => this.getZoomState(),
      marks: this.marks,
      marksOverlay: this.marksOverlay,
      harvester: this.harvester,
      screenshotStore: this.screenshotStore,
      beginHarvest: () => {
        this.state.agentStatus = 'HARVESTING';
        this.broadcastState();
      },
      onConstruct: (construct) => {
        this.latestConstruct = construct;
        this.sendToSurfaces('chassis:construct-harvested', construct);
      },
      addTokens: (tokens) => {
        this.state.stats.tokensHarvested += tokens;
      },
      reportIdle: () => this.reportIdle(),
      emitHarvest: (details) => this.emitSimpleEvent('harvest', details),
      log: this.controllerLog,
      indexPage: (url, title, content) => cortex.indexPage(url, title, content),
    });
    this.nav = new NavigationSurface({
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
        this.broadcastState();
      },
      log: this.controllerLog,
      bumpNav: () => bump('nav'),
      purgeJev: () => this.purgeJevDepthStore(),
      syncForceOpen: (wc) => this.syncForceOpenFor(wc),
      scheduleConsentSweep: () => this.consent.scheduleSweep(),
      bumpRevision: () => this.bumpRevision(),
      broadcastState: () => this.broadcastState(),
    });
    this.scriptVault = new ScriptVault();

    this.prerenderEngine = new PrerenderEngine(
      this.hostProfile,
      cortex,
      (level, msg) => this.addLog(level, msg)
    );

    this.hilManager = new HilManager({
      getActiveWebContents: () => {
        try {
          return this.getActiveWebContents();
        } catch {
          return null;
        }
      },
      broadcastAll: (channel, payload) => {
        try {
          this.broadcast(channel, payload);
        } catch {
          // Broadcasts must never break the hand-off flow itself.
        }
      },
      onHilStateChanged: (pending, req) => {
        this.trayManager?.updateStatus(this.state.agentStatus, this.state.tabs?.length || 0, pending);
        if (pending && req) {
          this.state.agentStatus = 'AWAITING_INPUT';
          this.state.activeAction = `⚠️ HUMAN ACTION REQUIRED: ${req.reason}`;
        } else {
          this.state.agentStatus = 'IDLE';
          this.state.activeAction = 'Standby - Awaiting MCP Uplink';
        }
        this.broadcastState();
      },
    });

    // Action ledger — local, append-only record of executed actions and their outcomes
    // (data/transitions.jsonl). This is the dataset a runner-side decision model learns from;
    // it never leaves the machine and never stores typed text.
    this.actionLedger = new ActionLedger({
      dir: dataPath(),
      log: (level, msg) => this.addLog(level, msg),
    });

    // Orthogonal primitives layer (observe / act / wait / extract / collect / find).
    // It borrows the chassis' real input + marks plumbing so it stays on the humanlike path.
    this.primitives = new Primitives({
      webContents: () => this.getActiveWebContents(),
      log: (level, msg) => this.addLog(level, msg),
      evaluate: (script) => this.evaluateQuiet(script),
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
      getFrames: (opts) => this.getFrames(opts),
      evaluateInFrames: (script, opts) => this.evaluateInFrames(script, opts),
      resolveSealedToken: (token) => resolveSealedTarget(this.getActiveWebContents(), token),
      clickMark: (id) => this.clickMark(id),
      typeMark: (id, text, opts) => this.typeMark(id, text, opts),
      clickElement: (selector, coords) => this.clickElement(selector, coords),
      typeText: (text, selector, opts) => this.typeText(text, selector, opts),
      findSealed: (opts) => this.marks.findSealed(opts),
      componentSurfaceEnabled: () => this.componentSurfaceEnabled(),
      insertText: (text) => this.simulator.insertText(this.getActiveWebContents(), text),
      pasteText: (text) => this.simulator.pasteText(this.getActiveWebContents(), text),
      moveMouseTo: (target) => this.moveMouse(target),
      pressKey: (key) => this.pressKey(key),
      snapshotRenderedPage: (opts) => this.marks.snapshotRenderedPage(opts),
      getNetworkTraffic: (filter) => this.getNetworkTraffic(filter),
      getPageInfo: () => this.getPageInfo(),
      revision: () => this.revision,
      windowFocused: () => this.isWindowFocused(),
      recordTransition: (record) => this.actionLedger.record(record),
    });

    // LLM-friendly site discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6).
    // `net.fetch` runs on Chromium's network stack (session cookies/UA/TLS); per-page
    // alternates go through a real document navigation instead of a synthetic fetch.
    this.llmSurface = new LlmSurface({
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

    this.researchLlmSurface = new LlmSurface({
      getSession: () => this.getResearchSession(),
      ...this.llmSurfaceBase(),
    });

    // Multi-engine web search (TODO_RESEARCH_CRAWL.md §5, Feature 5).
    this.searchHub = new SearchHub({
      load: (url, script, opts) => this.loadDetached(url, script, opts),
      log: (level, msg) => this.addLog(level, msg),
    });

    this.llm = new ReadSurface({
      probe: (url) => this.llmSurface.probe(url),
      fetch: (opts) => this.llmSurface.fetch(opts),
      readUrl: (opts) => this.llmSurface.readUrl(opts),
      renderMarkdown: (url) => this.readUrlRender(url),
      activity: this.surfaceActivity,
      log: this.controllerLog,
    });

    this.search = new SearchSurface({
      hub: this.searchHub,
      settings: () => this.researchSettings,
      applyEnginePolicy: (effective) => this.applyResearchEnginePolicy(effective),
      isCooling: (host) => this.isResearchCooling(host),
      markCooldown: (host, reason) => this.markResearchCooldown(host, reason),
      engineHost: (engine) => this.engineHost(engine),
      error: (code, message) => this.researchError(code, message),
      activity: this.surfaceActivity,
      log: this.controllerLog,
    });

    // Autonomous multi-page crawl (TODO_RESEARCH_CRAWL.md §5, Feature 1).
    // Cheap path first: content-negotiated Markdown/Text, else a detached render.
    this.crawler = new Crawler({
      tryLlm: async (url) => {
        const report = await this.researchLlmSurface.probe(url);
        if (!report.content_negotiation?.accepts_markdown) return null;
        const r = await this.researchLlmSurface.fetch({ url, as: 'markdown' });
        return { content: r.content, via: r.via };
      },
      fetchStatic: async (url, pageOpts) => {
        if (!this.researchSettings.preferStatic) {
          return { ok: false as const, reason: 'static tier disabled in settings', disabled: true };
        }
        try {
          if (this.citationController.originIsWarm(url)) {
            // A human authenticated this origin in the real browser; keep the cookie and the
            // browser together rather than replaying the session through a static client.
            return {
              ok: false as const,
              reason: 'origin is using the human-authenticated browser session',
              disabled: true,
            };
          }
        } catch {
          /* malformed URL falls through to the normal path */
        }
        const outcome = await fetchStatic(url);
        if (outcome.kind === 'blocked') {
          this.addLog('warn', `static fetch challenged for ${url} (${outcome.status}); escalating to render`);
          return { ok: false as const, reason: `challenge page (${outcome.status})` };
        }
        if (outcome.kind === 'unavailable') return { ok: false as const, reason: outcome.reason, disabled: true };
        if (outcome.kind === 'error') return { ok: false as const, reason: outcome.reason };
        if (outcome.result.status >= 400) return { ok: false as const, reason: `HTTP ${outcome.result.status}` };

        const harvested = this.harvester.harvest(outcome.result.body, url, url);
        // A JS-only shell harvests to almost nothing; escalate rather than index a stub.
        if (!harvested.content || harvested.content.trim().length < 200) {
          return { ok: false as const, reason: 'content too thin (possible JS-only shell)' };
        }
        let anchors: CitationAnchor[] | undefined;
        if (pageOpts?.anchorsFor) {
          anchors = (await this.citationController.anchorFromHtml(url, outcome.result.body, pageOpts.anchorsFor)) ?? [];
        }
        return {
          ok: true as const,
          title: harvested.title,
          markdown: harvested.content,
          status: outcome.result.status,
          anchors,
        };
      },
      renderPage: (url, pageOpts) => this.crawlRenderPage(url, pageOpts),
      beforePage: (url) => this.assertResearchCooldown(url),
      indexPage: async (url, title, content) => {
        await cortex.indexPage(url, title, content);
      },
      log: (level, msg) => this.addLog(level, msg),
    });

    // Autonomous research mode (TODO_RESEARCH_CRAWL.md §5, Feature 3).
    this.researcher = new Researcher({
      search: (q, o) => this.searchHub.search(q, o),
      crawl: (o) => this.crawler.crawl(o),
      log: (level, msg) => this.addLog(level, msg),
      events: (event) => this.broadcast('research:event', event),
    });

    this.crawlOrchestrator = new CrawlOrchestrator({
      settings: () => this.researchSettings,
      session: this.researchSessionController,
      citation: this.citationController,
      detachedView: this.detachedView,
      crawler: this.crawler,
      researcher: this.researcher,
      broadcast: (channel, payload) => this.broadcast(channel, payload),
      applyDelayFloor: (effective, opts) => {
        if (this.researchSettings.enabled) {
          effective.delayMs = Math.max(Number(opts.delayMs ?? 0), this.researchSettings.delayMs);
        }
      },
      log: (level, message) => this.addLog(level, message),
    });

    setInterval(() => {
      this.state.stats.uptimeSeconds++;
      this.broadcastState();
    }, 1000);

    // A renderer can stop painting without exiting. If the HUD heartbeat goes
    // quiet while the window is visible, reload it once and repaint the views.
    setInterval(() => this.checkHudHealth(), 5000);
  }

  public setWindow(win: BrowserWindow) {
    this.mainWindow = win;
    this.hudLastHeartbeat = Date.now();
    this.hilManager.setWindow(win);
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
    this.downloadManager.attachToSession(win.webContents.session);
    this.downloadManager.onDownloadComplete((record) => {
      this.addLog('info', `Download Complete: "${record.filename}" (${record.totalBytes} bytes) saved to data/downloads/`);
      this.emitSimpleEvent('harvest', `File Download Complete: ${record.filename}`);
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
        this.applyZoomToAllTabs();
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
      navigateForText: (url: string) => this.navigateForText(url),
      userAgent: this.hostProfile.userAgent,
      log: (level: 'info' | 'warn' | 'action', msg: string) => this.addLog(level, msg),
    };
  }

    private setupTabManager() {
    if (!this.mainWindow) return;

    this.viewportController = new ViewportController({
      store: new DeviceProfileStore(path.join(app.getPath('userData'), 'device-profiles.json')),
      available: () => this.getViewportBounds(),
      getTab: (tabId) => this.tabManager?.getTab(tabId) ?? null,
      getActiveTabId: () => this.tabManager?.getActiveTabId() ?? '',
      applyZoom: (wc) => this.applyZoom(wc),
      setInputScale: (wc, scale) => this.simulator.setViewportScale(wc, scale),
      relayout: () => this.tabManager?.updateActiveTabBounds(),
      broadcast: () => this.broadcastState(),
      log: (level, message) => this.addLog(level, message),
    });

    this.tabManager = new TabManager({
      mainWindow: this.mainWindow,
      hostProfile: this.hostProfile,
      getViewportBounds: () => this.getViewportBounds(),
      getTabBounds: (tabId) =>
        this.viewportController?.frameFor(tabId, this.getViewportBounds()) ?? this.getViewportBounds(),
      applyZoom: (wc) => this.applyZoom(wc),
      onZoomShortcut: (action) => {
        this.setZoom({ action });
      },
      onTakeoverShortcut: () => this.toggleHumanControl(),
      onRendererGone: (tab, details) => {
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
      },
      onTabUpdated: (tab: TabInstance) => {
        if (tab.id === this.tabManager?.getActiveTabId()) {
          this.state.currentUrl = tab.url;
          this.state.pageTitle = tab.title;
          this.state.isLoading = tab.isLoading;
          this.state.activeTabId = tab.id;
          this.broadcastState();

          if (!tab.isLoading) this.bumpRevision();

          // Re-arm the takeover listener after every document (listeners die with the page).
          if (this.tabReadyForBackgroundWork(tab)) {
            void tab.view.webContents.executeJavaScript(humanListenerScript()).catch(() => null);
          }
          if (this.tabReadyForBackgroundWork(tab)) {
            this.harvest.indexTabQuietly(tab);
          }
        }
      },
      onTabsChanged: (tabs: TabSummary[]) => {
        this.state.tabs = tabs;
        this.broadcastState();
        this.trayManager?.updateStatus(this.state.agentStatus, tabs.length, !!this.hilManager.getActiveRequest());
        this.sendToSurfaces('chassis:tabs-updated', tabs);
      },
      onTabCreated: (tab: TabInstance) => {
        this.networkInterceptor.attach(tab.view.webContents);
        this.viewportController?.registerTab(tab);
        // A tab created while force-open is armed must be patched *before* its document runs.
        // onTabCreated fires before the first load, but CDP arming is async; if the first document
        // already started, reload once so the patch is actually present.
        void this.syncForceOpenFor(tab.view.webContents).then((result) => {
          if (result.changed && result.armed && !tab.view.webContents.isDestroyed()) {
            setTimeout(() => {
              try {
                tab.view.webContents.reload();
              } catch {}
            }, 60);
          }
        });
      },
      onViewAdded: () => this.deck.bringToFront(),
      onTabClosed: (tabId) => this.viewportController?.unregisterTab(tabId),
      onLog: (level, msg) => this.addLog(level, msg),
      onConsoleLog: (log) => {
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
            this.addLog('warn', 'Collaboration note resolve signal was invalid.');
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
      },
    });

    this.addLog('info', `Stealth Profile Active: Spoofing host ${this.hostProfile.name} v${this.hostProfile.version}`);

    // Create initial default tab
    this.tabManager.createTab('about:blank');

    this.mainWindow.on('resize', () => {
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
    log: (level, message) => this.addLog(level, message),
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
    evaluate: (script) => this.evaluateQuiet(script),
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
  // The stealth research session (own cookie jar, UA headers, proxy), the settings
  // that configure it and the per-host cooldown live in ResearchSessionController.

  private readonly researchSessionController = new ResearchSessionController({
    hostProfile: this.hostProfile,
    log: (level, message) => this.addLog(level, message),
  });

  public async setResearchSettings(settings: ResearchSettings): Promise<void> {
    await this.researchSessionController.setSettings(settings);
  }

  public getResearchSettings(): ResearchSettings {
    return this.researchSessionController.getSettings();
  }

  /** The live research settings, as read by the search/crawl/research components. */
  private get researchSettings(): ResearchSettings {
    return this.researchSessionController.getSettings();
  }

  public async resetResearchSession(): Promise<void> {
    await this.researchSessionController.reset();
  }

  private getResearchSession(): Session {
    return this.researchSessionController.getSessionForComponents();
  }

  private async activateResearchView(wc: WebContents): Promise<void> {
    await this.researchSessionController.activateView(wc);
  }

  private engineHost(engine: string): string {
    return this.researchSessionController.engineHost(engine);
  }

  private isResearchCooling(host: string): boolean {
    return this.researchSessionController.isCooling(host);
  }

  private markResearchCooldown(host: string, reason: string): void {
    this.researchSessionController.markCooldown(host, reason);
  }

  private assertResearchCooldown(url: string): void {
    this.researchSessionController.assertNotCooling(url);
  }

  private researchError(code: string, message: string): Error & { code: string } {
    return researchError(code, message);
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
    this.addLog('action', directive);
    this.purgeJevDepthStore();
    return tabManager;
  }

  private requireTabManager(): NonNullable<BrowserChassis['tabManager']> {
    if (!this.tabManager) throw new Error('Browser Chassis uninitialized');
    return this.tabManager;
  }

  public getActiveWebContents(): Electron.WebContents {
    const wc = this.requireTabManager().getActiveTab().view.webContents;
    this.networkInterceptor.attach(wc);
    return wc;
  }

  // Tab Operations
  public createTab(url?: string): TabSummary {
    this.purgeJevDepthStore();
    const tab = this.requireTabManager().createTab(url);
    this.addLog('action', `MCP Directive: new_tab(${url || 'about:blank'})`);
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

  public getTabsSummary(): TabSummary[] {
    if (!this.tabManager) return [];
    return this.tabManager.getTabsSummary();
  }

  /** Install the persisted page-zoom policy (compensate vs Windows scale). */
  // ---- Page zoom ----------------------------------------------------------------------
  // Mode, override and the display-scale base factor live in ZoomController; these
  // delegations keep the chassis's public surface unchanged.

  private readonly zoomController = new ZoomController({
    displayScale: () => this.getDisplayScale(),
    viewportState: () => this.viewportController?.state() ?? null,
    isEmulated: (wc) => Boolean(this.viewportController?.isEmulated(wc as any)),
    bounds: () => this.getViewportBounds(),
    webContentsList: () => (this.tabManager?.allTabs() ?? []).map((tab) => ({ webContents: tab.view.webContents })),
    onChanged: () => this.broadcastState(),
  });

  public setZoomSettings(settings: ZoomSettings): void {
    this.zoomController.setSettings(settings);
  }

  public getZoomMode(): ZoomMode {
    return this.zoomController.getMode();
  }

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

  public getZoomState(): ZoomState {
    return this.zoomController.getState();
  }

  private applyZoom(wc: WebContents): void {
    this.zoomController.applyTo(wc);
  }

  public applyZoomToAllTabs(): void {
    this.zoomController.applyToAllTabs();
  }

  public getViewportState(): ViewportState {
    if (this.viewportController) return this.viewportController.state();
    const available = this.getViewportBounds();
    return {
      active: false,
      spec: null,
      orientation: 'portrait',
      available: { width: available.width, height: available.height },
      frame: { x: 0, y: 0, width: available.width, height: available.height },
      scale: 1,
      profiles: [],
    };
  }

  public async setViewport(input: {
    action?: 'status' | 'set' | 'rotate' | 'reset';
    preset?: string;
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
    mobile?: boolean;
    touch?: boolean;
  } = {}): Promise<ViewportState> {
    if (!this.viewportController) throw new Error('Browser Chassis uninitialized');
    return await this.viewportController.set(input);
  }

  public async resetViewport(): Promise<ViewportState> {
    if (!this.viewportController) throw new Error('Browser Chassis uninitialized');
    return await this.viewportController.reset();
  }

  public saveDeviceProfile(input: { name?: unknown; spec?: unknown }): ViewportProfileResult {
    if (!this.viewportController) return { ok: false, profiles: [] };
    return this.viewportController.saveProfile(input);
  }

  public deleteDeviceProfile(id: unknown): ViewportProfileResult {
    if (!this.viewportController) return { ok: false, profiles: [] };
    return this.viewportController.deleteProfile(id);
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
  public setZoom(input: {
    action?: 'status' | 'in' | 'out' | 'reset';
    factor?: number;
    mode?: ZoomMode;
  } = {}): ZoomState {
    return this.zoomController.setZoom(input);
  }

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
    ipcMain.handle('chassis:get-logs', () => this.logs);
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
      if (result.ok) this.simulator.setProfile(result.profile);
      return result;
    });

    ipcMain.handle('chassis:harvest', async () => {
      return await this.harvest.harvestMarkdown();
    });

  }

  private registerTabViewportIpc() {
    // Tab IPC Handlers
    ipcMain.handle('chassis:get-tabs', () => this.getTabsSummary());
    ipcMain.handle('chassis:create-tab', (_, url?: string) => this.createTab(url));
    ipcMain.handle('chassis:switch-tab', (_, tabId: string) => this.switchTab(tabId));
    ipcMain.handle('chassis:close-tab', (_, tabId?: string) => this.closeTab(tabId));

    // Page zoom: a runtime view control. The persisted mode is written from the
    // main process IPC handler (`chassis:zoom:mode`) so the bridge cannot change
    // a human setting by accident.
    ipcMain.handle('chassis:zoom:get', () => this.getZoomState());
    ipcMain.handle('chassis:zoom:set', (_, input: { action?: 'status' | 'in' | 'out' | 'reset'; factor?: number } = {}) =>
      this.setZoom(input),
    );

    // Responsive device emulation. The agent path is intentionally tiny (status/set/reset);
    // profile management is a human-only convenience.
    ipcMain.handle('chassis:viewport:get', () => this.getViewportState());
    ipcMain.handle('chassis:viewport:set', (_, input: Parameters<BrowserChassis['setViewport']>[0] = {}) =>
      this.setViewport(input),
    );
    ipcMain.handle('chassis:viewport:reset', () => this.resetViewport());
    ipcMain.handle('viewport:profile:save', (_, input: { name?: unknown; spec?: unknown }) =>
      this.saveDeviceProfile(input ?? {}),
    );
    ipcMain.handle('viewport:profile:delete', (_, id: unknown) => this.deleteDeviceProfile(id));
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
      this.addLog('warn', `Screenshot capture failed: ${err?.message || err}`);
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
    if (this.hilManager.getActiveRequest()) return;
    const pageUrl = url || this.getPageInfo().url;
    const detail = gate.evidence && gate.evidence.length ? ` — matched: ${gate.evidence.join(' | ')}` : '';
    await this.requestHumanIntervention(`${gate.reason}${detail}`, { url: pageUrl, bringToFront: true }).catch(() => null);
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
    this.broadcastState();
    this.addLog('warn', 'Human took control — synthetic input paused.');
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
      this.broadcastState();
    }
    if (wasHuman) this.addLog('info', 'Human handed control back — agent may act again.');
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
    this.emitTelemetry({
      type: 'click',
      timestamp: activity.at,
      details: `HUMAN ${activity.kind}${activity.target ? ` on ${activity.target}` : ''} — agent still has control`,
    });
    if (this.humanControl) return;
    const now = Date.now();
    if (now - this.lastHumanNoticeAt < 10_000) return;
    this.lastHumanNoticeAt = now;
    this.addLog(
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
    const existing = this.hilManager.getActiveRequest();
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

    const pending = this.requestHumanIntervention(reason, { url: pageUrl, bringToFront: true, timeoutSeconds: 300 });
    const id = this.hilManager.getActiveRequest()?.id ?? null;
    void pending.catch(() => null); // resolves when the human acts; we do not block the HTTP call
    return id;
  }
  private broadcastState() {
    this.state.zoom = this.getZoomState();
    this.state.viewport = this.viewportController?.state();
    // History availability is read at broadcast time, not cached on navigation: SPAs use pushState,
    // which fires no navigation event, and a tab switch swaps the history stack under the toolbar.
    try {
      const wc = this.tabManager?.getActiveTab()?.view?.webContents;
      if (wc && !wc.isDestroyed()) {
        this.state.canGoBack = wc.navigationHistory.canGoBack();
        this.state.canGoForward = wc.navigationHistory.canGoForward();
      }
    } catch {
      // A tab mid-teardown has no usable history; leave the previous flags alone.
    }
    this.sendToSurfaces('chassis:state-updated', this.state);
  }

  /**
   * The two states an agent-driven input action moves through. Every action
   * begins acting and ends idle; the trailing per-action work (bumpRevision,
   * telemetry, the returned summary) stays at the call site.
   */
  private reportActing(): void {
    this.state.agentStatus = 'SIMULATING_INPUT';
    this.broadcastState();
  }

  private reportIdle(): void {
    this.state.agentStatus = 'IDLE';
    this.broadcastState();
  }

/** The telemetry events that carry only a type and a details string. */
  private emitSimpleEvent(type: TelemetryEvent['type'], details: string): void {
    this.emitTelemetry({ type, timestamp: Date.now(), details });
  }

    private emitTelemetry(event: TelemetryEvent) {
    this.sendToSurfaces('chassis:telemetry', event);
  }

  /** The point-shaped events (mouse_move, click) the simulator reports. */
  private emitPointEvent(type: 'mouse_move' | 'click', point: { x: number; y: number }, details: string): void {
    this.emitTelemetry({
      type,
      x: point.x,
      y: point.y,
      timestamp: Date.now(),
      details,
    });
  }

  /** The harvest-shaped events (session save/restore and the construct path). */
  private emitHarvestDetails(details: string): void {
    this.emitTelemetry({
      type: 'harvest',
      timestamp: Date.now(),
      details,
    });
  }

  public addLog(level: 'info' | 'warn' | 'action', message: string) {
    const entry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      level,
      message,
    };
    this.logs.unshift(entry);
    if (this.logs.length > 100) this.logs.pop();

    this.sendToSurfaces('chassis:log', entry);
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


  // ---- Input actions ------------------------------------------------------------------
  // Click target resolution, the per-field form dispatch and the scroll fallback live
  // in InputActionsController; the chassis supplies the state surface.

  private readonly inputActions = new InputActionsController({
    activeWebContents: () => this.getActiveWebContents(),
    simulator: () => this.simulator,
    status: {
      acting: () => {
        this.state.agentStatus = 'SIMULATING_INPUT';
      },
      idle: () => this.reportIdle(),
      error: () => {
        this.state.agentStatus = 'ERROR';
        this.broadcastState();
      },
    },
    log: (level, message) => this.addLog(level, message),
    bumpRevision: () => this.bumpRevision(),
  });

  public async clickElement(selector?: string, coordinates?: { x: number; y: number }): Promise<string> {
    return this.inputActions.clickElement(selector, coordinates);
  }

  public async typeText(text: string, selector?: string, opts: { clearFirst?: boolean } = {}): Promise<string> {
    return this.inputActions.typeText(text, selector, opts);
  }

  public async fillForm(
    fields: Record<string, string | boolean | number>,
    submitSelector?: string
  ): Promise<{ success: boolean; fieldsFilled: number; submitted: boolean; details: string[] }> {
    return this.inputActions.fillForm(fields, submitSelector);
  }

  public async scrollPage(direction: 'up' | 'down', amount: number = 400): Promise<string> {
    return this.inputActions.scrollPage(direction, amount);
  }

  // ---- Screenshot persistence ---------------------------------------------------------
  // The screenshots directory, retention, compositor retry and the encode/save/
  // telemetry tail live in ScreenshotStore.

  private readonly screenshotStore = new ScreenshotStore({
    log: this.controllerLog,
    telemetry: this.controllerTelemetry,
  });


  public async pressKey(key: string): Promise<string> {
    const wc = this.getActiveWebContents();
    this.addLog('action', `MCP Directive: press_key("${key}")`);
    await this.simulator.pressKey(wc, key);
    this.bumpRevision();
    return `Pressed key: ${key}`;
  }

  public async evaluateJavaScript(script: string): Promise<any> {
    const wc = this.getActiveWebContents();
    this.addLog('action', `MCP Directive: evaluate_javascript("${script.substring(0, 30)}...")`);
    const result = await wc.executeJavaScript(script);
    return result;
  }

  /**
   * Evaluate in the main frame and its child frames (cross-origin included), via CDP isolated
   * worlds. Opt-in: two CDP commands per frame, so callers pass a frame budget.
   */
  public async evaluateInFrames(script: string, options?: FrameEvalOptions): Promise<FrameEvalResult[]> {
    const wc = this.getActiveWebContents();
    this.addLog('action', `MCP Directive: evaluate_in_frames(${options?.maxFrames ?? 8} max)`);
    return evaluateInFrames(wc, script, options);
  }

  /**
   * Shared control description used by marks, find, the decision guard and recipes.
   * One injected expression, no per-element round trips.
   */
  public async describeControls(options: ControlFactsOptions = {}): Promise<{ url?: string; controls: ControlFacts[] }> {
    if (options.deep === true) this.refuseShadow('deepOpenRoots');
    const wc = this.getActiveWebContents();
    const raw = await wc.executeJavaScript(controlFactsExpression(options)).catch(() => null);
    return parseControlFacts(raw);
  }

  /** Throws a structured refusal when a Shadow Walk surface is disabled. */
  private refuseShadow(surface: ShadowWalkSurface): void {
    const refusal = shadowWalkRefusal(surface);
    if (!refusal) return;
    const err: any = new Error(refusal.message);
    err.code = refusal.code;
    throw err;
  }

  /** Arm/disarm the force-open patch for the next document in this tab. */
  private async syncForceOpenFor(wc: WebContents): Promise<{ armed: boolean; changed: boolean; error?: string }> {
    const settings = loadShadowWalkSettings();
    return syncForceOpen(wc, settings.enabled && settings.shadow.forceOpen);
  }

  /**
   * Apply the current Shadow Walk policy to every open tab. Existing documents are not patched;
   * the patch applies on their next navigation (the UI says so).
   */
  public async applyShadowWalkSettings(): Promise<{ tabs: number; errors: string[] }> {
    const settings = loadShadowWalkSettings();
    const shouldArm = settings.enabled && settings.shadow.forceOpen;
    const tabs = this.tabManager?.allTabs() || [];
    const errors: string[] = [];
    for (const tab of tabs) {
      const result = await syncForceOpen(tab.view.webContents, shouldArm);
      if (result.error) errors.push(result.error);
    }
    return { tabs: tabs.length, errors };
  }

  public forceOpenArmed(): boolean {
    try {
      return isForceOpenArmed(this.getActiveWebContents());
    } catch {
      return false;
    }
  }

  /** A fingerprinting-style probe of the active document (read-only). */
  public async detectShadowPatch(): Promise<ForceOpenDetection> {
    return detectForceOpen(this.getActiveWebContents());
  }

  /** Frame tree + top-level geometry (no content scan). */
  public async listFrames(options: { maxFrames?: number } = {}): Promise<FrameInfo[]> {
    this.refuseShadow('frames');
    return listFrames(this.getActiveWebContents(), options);
  }

  /** Whether component signatures are allowed by Settings → Shadow Walk. */
  public componentSurfaceEnabled(): boolean {
    return loadShadowWalkSettings().shadow.componentSurface;
  }

  /** Trusted Tab/Shift+Tab walk into a (possibly closed) shadow subtree. */
  public async focusWalk(options: TabWalkOptions): Promise<TabWalkResult> {
    this.refuseShadow('tabWalk');
    const settings = loadShadowWalkSettings();
    const wc = this.getActiveWebContents();
    const maxSteps = Math.min(
      options.maxSteps ?? settings.shadow.tabWalkMaxSteps,
      settings.shadow.tabWalkMaxSteps
    );
    const restore = options.restore ?? settings.shadow.tabWalkRestoreFocus;
    this.addLog('action', `MCP Directive: focus_walk(${options.selector || `${options.x},${options.y}`}, ${options.direction || 'forward'})`);
    const result = await runTabWalk(wc, { ...options, maxSteps, restore }, (key) => this.simulator.pressKey(wc, key));
    this.bumpRevision();
    return result;
  }

  /**
   * A frame as first-class content: where it is, what is inside it, and (optionally) what it looks
   * like. Frame-local control rects are offset into the top-level viewport, so the result can be
   * clicked with act(x, y) or read coordinate-free.
   *
   * Opt-in and bounded: the frame walk costs CDP commands per frame, and screenshots cost one
   * capture plus one crop per visible frame. `find(include_frames)` uses the same scan.
   */
  /**
   * A frame as first-class content: where it is, what is inside it, and (optionally) what it looks
   * like. The inventory pipeline lives in browser/frames-inventory.ts; the chassis keeps the
   * Shadow Walk guard and the delegation.
   */
  public async getFrames(options: {
    includeControls?: boolean;
    screenshots?: boolean;
    maxFrames?: number;
    maxControls?: number;
    selector?: string;
    includeOffscreen?: boolean;
    skipHitTest?: boolean;
    maxSide?: number;
  } = {}): Promise<FrameInventoryResult> {
    this.refuseShadow('frames');
    return inventoryFrames(this.getActiveWebContents(), options, {
      log: (level, message) => this.addLog(level, message),
      capturePage: (wc, bounds) => this.harvest.capturePageWithRetry(wc, bounds),
    });
  }


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

  public getDownloads(): DownloadRecord[] {
    return this.downloadManager.getDownloads();
  }

  public async readDownloadedDocument(filenameOrId: string) {
    this.addLog('action', `MCP Directive: read_download("${filenameOrId}")`);
    return await this.downloadManager.readDocumentContent(filenameOrId);
  }

  public async saveSession(name?: string) {
    this.addLog('action', `MCP Directive: save_session("${name || 'auto'}")`);
    const result = await this.sessionVault.saveSession(this.getActiveWebContents().session, this.getActiveWebContents(), name);
    this.emitHarvestDetails(`Saved session "${result.name}" with ${result.cookiesCount} cookies`);
    return result;
  }

  public async restoreSession(name: string) {
    this.addLog('action', `MCP Directive: restore_session("${name}")`);
    const wc = this.getActiveWebContents();
    const result = await this.sessionVault.restoreSession(wc.session, wc, name);
    this.emitHarvestDetails(`Restored session "${result.name}" (${result.cookiesRestored} cookies)`);
    return result;
  }

  public listSessions() {
    return this.sessionVault.listSessions();
  }

  public deleteSession(name: string) {
    this.addLog('action', `MCP Directive: delete_session("${name}")`);
    return this.sessionVault.deleteSession(name);
  }

  public getNetworkTraffic(filter?: NetworkFilter): CapturedNetworkRequest[] {
    return this.networkInterceptor.getTraffic(filter);
  }

  public getApiPayload(requestId: string) {
    this.addLog('action', `MCP Directive: get_api_payload("${requestId}")`);
    return this.networkInterceptor.getPayload(requestId);
  }

  public clearNetworkTraffic(): void {
    this.addLog('action', 'MCP Directive: clear_network_traffic()');
    this.networkInterceptor.clear();
  }

  public getRealtimeStreams(options?: { type?: 'websocket' | 'sse'; activeOnly?: boolean }): RealtimeStream[] {
    return this.networkInterceptor.getStreams(options);
  }

  public getStreamMessages(options?: {
    streamId?: string;
    type?: 'websocket' | 'sse';
    direction?: 'sent' | 'received';
    limit?: number;
  }): StreamMessage[] {
    this.addLog('action', `MCP Directive: get_stream_messages(${options?.type || 'all'})`);
    return this.networkInterceptor.getStreamMessages(options);
  }

  public clearStreamMessages(streamId?: string): void {
    this.addLog('action', 'MCP Directive: clear_stream_messages()');
    this.networkInterceptor.clearStreamMessages(streamId);
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
    this.addLog('action', `MCP Directive: query_json_data(${params.source}${params.sourceId ? `:${params.sourceId}` : ''}, view=${params.view || 'value'})`);

    let targetData: any = null;

    switch (params.source) {
      case 'network_payload': {
        if (!params.sourceId) throw new Error('Missing "sourceId" (requestId) for source "network_payload"');
        const payload = this.networkInterceptor.getPayload(params.sourceId);
        targetData = payload.data;
        break;
      }

      case 'stream_messages': {
        const messages = this.networkInterceptor.getStreamMessages({
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
    this.addLog('action', `MCP Directive: prerender_links(maxPages=${options.maxPages || 3})`);
    return await this.prerenderEngine.prerender(wc, options);
  }

  // ---- LLM-friendly site discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6) ----


  /**
   * Run a research tool with the activity events the research feed expects: a
   * start broadcast, then a done broadcast carrying `ok`, duration and the
   * caller-computed success summary (the failure summary is the start summary).
   * Errors propagate after the failed broadcast.
   */
  private async withResearchActivity<T>(
    tool: string,
    summary: string,
    describe: (result: T) => string,
    run: () => Promise<T>,
  ): Promise<T> {
    const runId = randomUUID();
    const startedAt = Date.now();
    this.broadcast('research:event', { type: 'activity', runId, tool, status: 'start', summary, at: startedAt });
    try {
      const result = await run();
      this.broadcast('research:event', {
        type: 'activity',
        runId,
        tool,
        status: 'done',
        summary: describe(result),
        ok: true,
        ms: Date.now() - startedAt,
        at: Date.now(),
      });
      return result;
    } catch (error: any) {
      this.broadcast('research:event', {
        type: 'activity',
        runId,
        tool,
        status: 'done',
        summary,
        ok: false,
        ms: Date.now() - startedAt,
        at: Date.now(),
      });
      throw error;
    }
  }



  /**
   * Renders a URL in the shared detached view and distils it to Markdown — the composite
   * `read_url` fallback. Deliberately not `crawlRenderPage`: `read_url` is a single-page
   * *read* (no crawl budgets, no link harvesting), so it does not consume crawl policy.
   */
  public async readUrlRender(
    url: string,
  ): Promise<{ markdown: string; title: string; status: number; contentType: string | null }> {
    const r = await this.loadDetached<{ title: string }>(
      url,
      '(() => ({ title: document.title || "" }))()',
      {
        timeoutMs: 25000,
        after: async (wc) => (await RenderedSnapshotEngine.capture(wc, { format: 'markdown', waitUntilIdleMs: 400 })).content,
      },
    );
    return { markdown: r.after || '', title: r.result?.title || url, status: r.status, contentType: r.contentType };
  }

  /**
   * Loads a URL in a *detached* WebContentsView (real Chromium, host fingerprint) and returns the
   * result of `script`. Used for reading advertised Markdown/Text alternates and for `search_web`
   * SERPs — without hijacking the active tab. Optionally waits for `readyScript` to become truthy.
   */
  /**
   * Run a task that reads or drives the shared off-screen research view.
   *
   * `loadDetached` already serializes its own work; this extends the same queue to the human
   * hand-off and anchor capture, which otherwise let a concurrent detached read steal the view.
   */
  // ---- Detached research view ---------------------------------------------------------
  // One reusable off-screen view and its operation queue live in
  // DetachedViewController; these delegations keep the chassis's public surface unchanged.

  private readonly detachedView = new DetachedViewController({
    userAgent: this.hostProfile.userAgent,
    activate: (wc) => this.activateResearchView(wc),
  });

  private async withUtilView<T>(task: () => Promise<T>): Promise<T> {
    return this.detachedView.withView(task);
  }

  private async loadDetached<T = any>(
    url: string,
    script: string,
    opts: { timeoutMs?: number; settleMs?: number; readyScript?: string; readyMs?: number; after?: (wc: WebContents) => Promise<any> } = {},
  ): Promise<{ result: T | null; after: any; status: number; contentType: string | null }> {
    return this.detachedView.load<T>(url, script, opts);
  }

  public async navigateForText(url: string): Promise<{ body: string | null; contentType: string | null; status: number }> {
    return this.detachedView.navigateForText(url);
  }

  /**
   * Runs a web search across a configurable engine chain (TODO_RESEARCH_CRAWL.md §5, Feature 5).
   * Each engine is loaded in a detached view; if it yields nothing (bot-check/consent) the hub
   * falls back to the next. Results are plain URLs for `navigate_to` / `collect_all`.
   */
  /** The Settings engine chain and custom template, applied unless the call overrides them. */
  private applyResearchEnginePolicy<T extends { engine?: string; engines?: string[]; urlTemplate?: string }>(
    effective: T,
  ): void {
    this.researchSessionController.applyEnginePolicy(effective);
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

  // ---- Citations & human hand-off -----------------------------------------------------
  // The anchor store, warm origins, hand-off state and the citation fetch/relocate
  // pipeline live in CitationController.

  private readonly citationController = new CitationController({
    window: () => this.mainWindow,
    detachedView: this.detachedView,
    hilManager: () => this.hilManager,
    researchSettings: () => this.researchSettings,
    viewportBounds: () => this.computeViewportBounds(),
    reassertViewport: () => this.reassertViewport(),
    activeWebContents: () => this.getActiveWebContents(),
    log: (level, message) => this.addLog(level, message),
  });

  public async relocateCitation(opts: {
    url: string;
    fingerprint: unknown;
    threshold?: number;
  }): Promise<CitationRelocation> {
    return this.citationController.relocateCitation(opts);
  }

  public async revalidateStored(opts: { url?: string; maxUrls?: number } = {}): Promise<RevalidationSummary> {
    return this.citationController.revalidateStored(opts);
  }

  private async attemptHumanHandoff(
    url: string,
    onHuman?: (info: HumanAssistInfo) => void,
    anchorsFor?: string,
  ): Promise<HumanHandoffResult> {
    return this.citationController.attemptHandoff(url, onHuman, anchorsFor);
  }

  /** Renders a page in a detached view and returns its Markdown + outgoing links (for deep_crawl). */
  // ---- Crawl & research runs ----------------------------------------------------------
  // The render-with-escalation pipeline, the BFS crawl and its research-workspace
  // event mirror, and the topic run live in CrawlOrchestrator.

  private readonly crawlOrchestrator: CrawlOrchestrator;

  public async crawlRenderPage(url: string, opts: RenderCrawlOptions = {}): Promise<RenderCrawlResult> {
    return this.crawlOrchestrator.crawlRenderPage(url, opts);
  }

  /** Depth/page-budgeted BFS crawl that indexes each page into Cortex (Feature 1). */
  public async deepCrawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    return this.crawlOrchestrator.deepCrawl(opts);
  }

  /** search → gather top sources → distill → index; returns cited extractive evidence (Feature 3). */
  public async researchTopic(opts: ResearchOptions): Promise<ResearchOutcome> {
    return this.crawlOrchestrator.researchTopic(opts);
  }

  public async takeAnnotatedScreenshot(opts: { economy?: boolean; textOnly?: boolean; includeOffscreen?: boolean } = {}): Promise<{
    screenshot: ScreenshotPayload;
    marks: MarkItem[];
  }> {
    const wc = this.getActiveWebContents();
    const economy = Boolean(opts.economy);
    const textOnly = Boolean(opts.textOnly);
    const includeOffscreen = Boolean(opts.includeOffscreen);
    this.addLog('action', `MCP Directive: take_annotated_screenshot(${textOnly ? 'text_only' : economy ? 'economy' : 'full'}${includeOffscreen ? ', include_offscreen' : ''})`);

    // Text-only: badges are only needed to populate the mark registry; no pixels are captured.
    if (textOnly) {
      const textMarks = await this.marks.scan(wc, { includeOffscreen });
      await this.marksOverlay.removeMarks(wc);
      const viewport = this.getViewportBounds();
      const zoom = this.getZoomState();
      return {
        screenshot: {
          base64Image: '',
          filePath: '',
          width: viewport.width,
          height: viewport.height,
          mimeType: 'image/png',
          zoom,
          nativeWidth: viewport.width,
          nativeHeight: viewport.height,
          coordinateScale: zoom.viewport.css.width > 0 ? viewport.width / zoom.viewport.css.width : 1,
        },
        marks: textMarks,
      };
    }

    // 1. Inject visual badges into DOM
    const marks = await this.marks.scan(wc, { includeOffscreen });

    // Wait a brief tick for render paint
    await new Promise((r) => setTimeout(r, 80));

    // 2. Capture annotated screenshot
    const bounds = this.getViewportBounds();
    const image = await this.harvest.capturePageWithRetry(wc, bounds);

    // 3. Immediately clean up marks from DOM
    await this.marksOverlay.removeMarks(wc);
    const zoom = this.getZoomState();
    const nativeSize = image.getSize();

    // Economy mode: downscale to max 640px wide and encode as JPEG (~10-20x smaller payload)
    const ECONOMY_MAX_WIDTH = 640;
    let outImage = image;
    if (economy && image.getSize().width > ECONOMY_MAX_WIDTH) {
      outImage = image.resize({ width: ECONOMY_MAX_WIDTH, quality: 'good' });
    }

    const screenshot = this.harvest.persistScreenshot({
      image: outImage,
      jpeg: economy,
      quality: 45,
      prefix: `annotated_${economy ? 'eco_' : ''}`,
      details: (facts) => `Set-of-Marks: Tagged ${marks.length} interactive targets, saved to ${facts.filePath}`,
      zoom,
      nativeSize,
    });

    return {
      screenshot,
      marks,
    };
  }

  /**
   * Resolve a Set-of-Marks target: ids >= 100 live in iframes, the rest in the
   * overlay. Throws the refresh hint agents already retry on when the mark is
   * gone — the same failure for click, type and the focus retry.
   */
  private async resolveMarkTarget(wc: WebContents, markId: number) {
    const target = markId >= 100
      ? await resolveFrameMark(wc, markId)
      : await this.marksOverlay.getMarkTarget(wc, markId);
    if (!target) {
      throw new Error(`Mark #${markId} not found. Call find(include_frames:true) or take_annotated_screenshot() to refresh marks.`);
    }
    return target;
  }

  /**
   * Focus a mark: resolve it, report the agent as acting, click its centre and
   * (optionally) settle — the shared prologue of click and type.
   */
  private async focusMark(wc: WebContents, markId: number, settleMs = 0) {
    const target = await this.resolveMarkTarget(wc, markId);
    this.reportActing();
    await this.simulator.clickAt(wc, target.currentCenter);
    if (settleMs) await new Promise((r) => setTimeout(r, settleMs));
    return target;
  }

  public async clickMark(markId: number): Promise<string> {
    const wc = this.getActiveWebContents();
    this.addLog('action', `MCP Directive: click_mark(#${markId})`);
    const target = await this.focusMark(wc, markId);

    this.reportIdle();

    this.emitPointEvent('click', target.currentCenter, `Set-of-Marks: Clicked mark #${markId} [${target.mark.tag}: "${target.mark.text}"]`);

    this.bumpRevision();
    return `Clicked mark #${markId} (${target.mark.tag}: "${target.mark.text}")`;
  }

  public async typeMark(markId: number, text: string, opts: { secret?: boolean; clearFirst?: boolean } = {}): Promise<string> {
    const wc = this.getActiveWebContents();
    const shown = opts.secret ? `[REDACTED ${String(text).length} chars]` : `"${text}"`;
    this.addLog('action', `MCP Directive: type_mark(#${markId}, ${shown}${opts.clearFirst ? ', clear_first' : ''})`);
    const target = await this.focusMark(wc, markId, 100);

    // A stray or occluded click silently sends keystrokes nowhere (sticky headers,
    // lazy re-renders, a hidden window). Verify the target actually took focus and,
    // if not, re-resolve its live centre and click once more before typing.
    const focusedOk = markId >= 100
      ? true
      : await wc
          .executeJavaScript(
            `(() => {${DEEP_DOM_HELPERS}
              const el = kqDeep('[data-mark-id="${markId}"]');
              if (!el) return true;
              const a = kqActive();
              if (!a) return false;
              return a === el || kqContainsComposed(el, a) || kqContainsComposed(a, el);
            })()`
          )
          .catch(() => true);
    if (focusedOk === false) {
      this.addLog('warn', `type_mark(#${markId}): target did not take focus after click; retrying once.`);
      const retry = await this.resolveMarkTarget(wc, markId).catch(() => null);
      if (retry) {
        await this.simulator.clickAt(wc, retry.currentCenter);
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (opts.clearFirst) {
      // Replace rather than append: the target may already hold a value (e.g. a pre-filled
      // origin/airport field), and appending silently corrupts it.
      await this.simulator.clearFocusedField(wc);
    }

    await this.simulator.typeText(wc, text);

    this.reportIdle();
    this.bumpRevision();

    return opts.secret
      ? `Focused mark #${markId} and typed ${String(text).length} chars (redacted)`
      : `Focused mark #${markId} and typed "${text}"`;
  }

  public async saveScript(data: {
    name: string;
    code: string;
    description?: string;
    domain?: string;
    tags?: string[];
  }): Promise<ScriptItem> {
    this.addLog('action', `MCP Directive: save_script("${data.name}")`);
    const saved = await this.scriptVault.saveScript(data);
    this.emitSimpleEvent('harvest', `Saved & indexed script "${saved.name}" in Cortex Vault`);
    return saved;
  }

  public async recallScripts(query?: string, options?: { domain?: string; tag?: string; limit?: number }): Promise<ScriptItem[]> {
    this.addLog('action', `MCP Directive: recall_scripts("${query || '*'}")`);
    return await this.scriptVault.recallScripts(query, options);
  }

  public async runScript(name: string, args: Record<string, any> = {}) {
    const wc = this.getActiveWebContents();
    this.addLog('action', `MCP Directive: run_script("${name}")`);
    this.reportActing();

    try {
      const res = await this.scriptVault.runScript(wc, name, args);
      this.reportIdle();
      this.emitSimpleEvent('harvest', `Executed macro "${name}" in ${res.executionDurationMs}ms`);
      return res;
    } catch (err: any) {
      this.reportIdle();
      throw err;
    }
  }

  public async listScripts(domain?: string, tag?: string): Promise<ScriptItem[]> {
    return await this.scriptVault.listScripts(domain, tag);
  }

  public async deleteScript(name: string): Promise<boolean> {
    this.addLog('action', `MCP Directive: delete_script("${name}")`);
    return await this.scriptVault.deleteScript(name);
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

  // Human-In-The-Loop & Notifications
  public async requestHumanIntervention(
    reason: string,
    options?: { url?: string; timeoutSeconds?: number; bringToFront?: boolean }
  ): Promise<HilResolution> {
    this.addLog('warn', `⚠️ Human Intervention Requested: ${reason}`);
    this.emitSimpleEvent('navigation', `HIL Intervention: ${reason}`);
    return this.hilManager.requestIntervention({
      reason,
      url: options?.url,
      timeoutSeconds: options?.timeoutSeconds,
      bringToFront: options?.bringToFront,
    });
  }

  public resolveHumanIntervention(id?: string, notes?: string): boolean {
    const success = this.hilManager.resolveIntervention(id, notes);
    if (success) {
      this.addLog('info', `Human intervention resolved: ${notes || 'User confirmed.'}`);
    }
    return success;
  }

  public cancelHumanIntervention(id?: string): boolean {
    return this.hilManager.cancelIntervention(id);
  }

  public getActiveHumanIntervention(): HilRequest | null {
    return this.hilManager.getActiveRequest();
  }

  public getHumanInterventionHistory(): HilRequest[] {
    return this.hilManager.getHistory();
  }

  public sendNotification(
    title: string,
    message: string,
    urgency?: 'normal' | 'critical' | 'low',
    sound?: boolean
  ): boolean {
    this.addLog('info', `Desktop Notification Dispatched: [${title}] ${message}`);
    return this.hilManager.sendNotification({ title, message, urgency, sound });
  }

  // Bio-Kinematic Chaos Trajectory Methods
  public testChaosTrajectory(target: { x: number; y: number }, options?: ChaosKinematicsOptions): PathStep[] {
    const start = this.simulator.getCursorPosition();
    return generateChaosTrajectory(start, target, options);
  }

  public async moveMouse(target: { x: number; y: number }, options?: ChaosKinematicsOptions): Promise<void> {
    const wc = this.getActiveWebContents();
    await this.simulator.moveMouseTo(wc, target, options);
  }

  public getSimulator(): HumanizedInputSimulator {
    return this.simulator;
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

  /** Executes page script without per-poll log spam (used by primitives probes). */
  public async evaluateQuiet(script: string): Promise<any> {
    const wc = this.getActiveWebContents();
    return await wc.executeJavaScript(script);
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
