/**
 * Surface adapters for the host contract.
 *
 * A composition root should not carry a wiring literal per surface. These
 * factories map `ChassisHost` onto each surface's deps, so the chassis
 * constructor reads as an ordered list of surfaces. They also keep `host.ts`
 * acyclic: the surfaces with narrow deps of their own are adapted here rather
 * than imported into the host contract.
 */
import { activeWebContents, bumpRevision, pageInfo } from './accessors.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChassisHost } from './host.js';
import { PageScriptSurface } from '../browser/page-script-surface.js';
import { ResearchViewSurface } from '../research/research-view-surface.js';
import { ShadowWalkSurface } from '../shadow-walk/shadow-surface.js';
import { HumanControlSurface } from '../input/human-control.js';
import { DeckController } from '../deck/controller.js';
import { JevController } from '../jev/controller.js';
import { ZoomController } from '../zoom/controller.js';
import { ConsentController } from '../shield/consent-controller.js';
import { HudWatchdog } from '../boot/hud-watchdog.js';
import { CollaborationSurface } from '../collaboration/surface.js';
import { WindowBootSurface } from '../boot/window-boot.js';
import { decisionStatus } from '../decide/decision-client.js';
import { displayScale } from '../zoom/display-scale.js';
import { logMainEvent } from '../diagnostics/main-log.js';
import { reassertViewport } from '../window/reassert-viewport.js';
import { createTabEventHandlers } from '../tabs/tab-events.js';
import { humanListenerScript } from '../input/human-activity.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: the chassis constructor — the page-script surface over the host's tab. */
export function createPageScriptSurface(host: ChassisHost): PageScriptSurface {
  return new PageScriptSurface({
    activeWebContents: () => activeWebContents(host),
    log: host.log,
  });
}

/** When to use: the chassis constructor — Shadow Walk policy and frame reads over the host's tabs. */
export function createShadowWalkSurface(host: ChassisHost): ShadowWalkSurface {
  return new ShadowWalkSurface({
    activeWebContents: () => activeWebContents(host),
    allTabs: () => host.tabSetup.manager?.registry.all() ?? [],
    log: host.log,
    pressKey: (wc, key) => host.input.simulator.keyboard.pressKey(wc, key),
    bumpRevision: () => bumpRevision(host),
    capturePage: (wc, bounds) => host.harvest.capturePageWithRetry(wc, bounds),
  });
}

/** When to use: the chassis constructor — the detached research view plus citations/hand-off. */
export function createResearchViewSurface(host: ChassisHost): ResearchViewSurface {
  return new ResearchViewSurface({
    userAgent: host.hostProfile.userAgent,
    activate: (wc) => host.research.activateView(wc),
    window: () => host.getMainWindow(),
    hilManager: () => host.hil.manager,
    researchSettings: () => host.research.settings(),
    viewportBounds: () => viewportBoundsOf(host),
    reassertViewport: () => reassertViewport(host.getMainWindow(), () => host.deck.position(), host.tabSetup.manager),
    activeWebContents: () => activeWebContents(host),
    log: host.log,
  });
}

/** When to use: the chassis constructor — the explicit human-takeover latch. */
export function createHumanSurface(host: ChassisHost): HumanControlSurface {
  return new HumanControlSurface({
    markHuman: () => {
      host.state.agentStatus = 'HUMAN_INPUT';
      host.state.activeAction = 'Human control — agent paused';
      host.telemetry.broadcastState();
    },
    markIdle: () => {
      if (host.state.agentStatus === 'HUMAN_INPUT') {
        host.state.agentStatus = 'IDLE';
        host.state.activeAction = 'Human handed back control';
        host.telemetry.broadcastState();
      }
    },
    log: host.log,
    emitHumanActivity: (activity) =>
      host.telemetry.emitTelemetry({
        type: 'click',
        timestamp: activity.at,
        details: `HUMAN ${activity.kind}${activity.target ? ` on ${activity.target}` : ''} — agent still has control`,
      }),
    focusActiveTab: () => {
      try {
        const wc = activeWebContents(host);
        host.getMainWindow()?.focus();
        wc.focus();
      } catch {
        /* window/tab closing */
      }
    },
    currentUrl: () => host.state.currentUrl,
  });
}

/** When to use: the chassis constructor — the deck panel, its modes and the collab wiring. */
export function createDeckController(host: ChassisHost): DeckController {
  return new DeckController({
    window: () => host.getMainWindow(),
    loadPanel: (view) => {
      const devUrl = process.env.VITE_DEV_SERVER_URL;
      if (devUrl) {
        const url = new URL(devUrl);
        url.searchParams.set('sidebar', '1');
        view.webContents.loadURL(url.toString());
      } else {
        view.webContents.loadFile(path.join(moduleDir, '../../dist/index.html'), {
          query: { sidebar: '1' },
        });
      }
    },
    popupPreloadPath: path.join(moduleDir, '../preload/index.js'),
    activeWebContents: () => activeWebContents(host),
    pageUrl: () => pageInfo(host).url,
    log: host.log,
    onModeChanged: () => host.tabSetup.manager?.updateActiveTabBounds(),
    sendToShell: (channel, payload) => host.bus.toShell(channel, payload),
    onPanelLoaded: () => host.deck.panel.send('chassis:decision-status', decisionStatus()),
    stopSelection: () => host.collaboration.stopSelection(),
  });
}

/** When to use: the chassis constructor — JEV page compaction over the active page. */
export function createJevController(host: ChassisHost): JevController {
  return new JevController({
    policy: () => ({ available: false, enforce: false }),
    pageInfo: () => pageInfo(host),
    evaluate: (script) => host.page.quiet(script),
    harvest: () => host.harvest.harvestMarkdown(),
  });
}

/** When to use: the chassis constructor — the page-zoom policy. */
export function createZoomController(host: ChassisHost): ZoomController {
  return new ZoomController({
    displayScale: () => displayScale(host.getMainWindow()),
    viewportState: () => host.tabSetup.viewport?.state() ?? null,
    isEmulated: (wc) => Boolean(host.tabSetup.viewport?.isEmulated(wc as never)),
    bounds: () => host.tabSetup.bounds(),
    webContentsList: () => (host.tabSetup.manager?.registry.all() ?? []).map((tab) => ({ webContents: tab.view.webContents })),
    onChanged: () => host.telemetry.broadcastState(),
  });
}

/** When to use: the chassis constructor — the consent sweep over the active page. */
export function createConsentController(host: ChassisHost): ConsentController {
  return new ConsentController({
    activeWebContents: () => activeWebContents(host),
    shieldBreaker: () => host.shieldBreaker,
    policy: () => host.consentPolicy,
    log: host.log,
    telemetry: (event) => host.telemetry.emitTelemetry(event),
  });
}

/** When to use: the chassis constructor — the HUD heartbeat and viewport-recovery watchdog. */
export function createHudWatchdog(host: ChassisHost): HudWatchdog {
  return new HudWatchdog({
    window: () => host.getMainWindow(),
    reassertViewport: () => reassertViewport(host.getMainWindow(), () => host.deck.position(), host.tabSetup.manager),
    applyZoomToAllTabs: () => host.zoom.applyToAllTabs(),
    logEvent: (name) => logMainEvent(name),
  });
}

/** When to use: the chassis constructor — the page overlay picker and its signal channel. */
export function createCollaborationSurface(host: ChassisHost): CollaborationSurface {
  return new CollaborationSurface({
    activeWebContents: () => activeWebContents(host),
    pageInset: () => host.deck.panel.pageInset(),
    setCollabMode: (open) => host.deck.setCollabMode(open),
    resolveNote: (id) => host.deck.collab.cycle.resolveNote(id),
    forwardClassEdit: (target, added, removed) => host.deck.collab.providers.forwardClassEdit(target, added, removed),
    log: host.log,
  });
}

/** When to use: the chassis constructor — the ordered shell-window boot sequence. */
export function createWindowBoot(host: ChassisHost): WindowBootSurface {
  return new WindowBootSurface({
    setMainWindow: (win) => host.setMainWindow(win),
    hilSetWindow: (win) => host.hil.manager.setWindow(win),
    hudWatch: (win) => host.hud.watch(win),
    toggleHuman: () => host.human.toggle(),
    createTray: (win) => host.createTray(win),
    attachDownloads: (session) => host.downloads.manager.attachToSession(session),
    onDownloadComplete: (handler) => host.downloads.manager.onDownloadComplete(handler),
    logDownload: (record) => host.logDownload(record),
    setupTabs: () => host.tabSetup.setup(),
    registerIpc: () => host.registerIpc(),
    setupDeck: () => host.deck.panel.setup(),
  });
}

/**
 * Bounds of the page viewport as actually laid out in the HUD (zoom-aware).
 *
 * The layout bounds come from the shell's `#viewport-container`; a missing or
 * destroyed window falls back to the computed tab bounds.
 */
async function viewportBoundsOf(host: ChassisHost): Promise<Bounds> {
  const win = host.getMainWindow();
  if (!win || win.isDestroyed()) return host.tabSetup.bounds();
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
  return host.tabSetup.bounds();
}

/** The five surfaces the rest of the composition reads, built first. */
export interface ChromeSurfaces {
  human: HumanControlSurface;
  deck: DeckController;
  zoom: ZoomController;
  hud: HudWatchdog;
  collaboration: CollaborationSurface;
}

/** When to use: the chassis constructor — build the chrome surfaces first. */
export function createChromeSurfaces(host: ChassisHost): ChromeSurfaces {
  return {
    human: createHumanSurface(host),
    deck: createDeckController(host),
    zoom: createZoomController(host),
    hud: createHudWatchdog(host),
    collaboration: createCollaborationSurface(host),
  };
}

/** When to use: the chassis constructor — the tab manager lifecycle reactions. */
export function createTabEvents(host: ChassisHost): ReturnType<typeof createTabEventHandlers> {
  return createTabEventHandlers({
    state: host.state,
    activeTabId: () => host.tabSetup.manager?.registry.activeId,
    allTabs: () => host.tabSetup.manager?.registry.all() ?? [],
    broadcastState: () => host.telemetry.broadcastState(),
    bumpRevision: () => bumpRevision(host),
    reassertViewport: () => reassertViewport(host.getMainWindow(), () => host.deck.position(), host.tabSetup.manager),
    send: (channel, payload) => host.bus.toSurfaces(channel, payload),
    updateTray: (pending) =>
      host.trayManager?.updateStatus(host.state.agentStatus, host.state.tabs?.length ?? 0, pending),
    hilPending: () => !!host.hil.manager.getActiveRequest(),
    attachNetwork: (wc) => host.network.manager.attach(wc),
    registerViewportTab: (tab) => host.tabSetup.viewport?.registerTab(tab),
    syncForceOpen: (wc) => host.shadow.syncForceOpen(wc),
    indexTab: (tab) => host.harvest.indexTabQuietly(tab),
    ingestHuman: (message) => host.human.monitor.ingest(message),
    noteHuman: (activity) => host.human.note(activity),
    recordConsole: (log) => host.consoleLogs.record(log),
    collaborationSignal: (message) => host.collaboration.handleSignal(message),
    logEvent: (name, detail) => logMainEvent(name, detail),
    humanListenerScript: () => humanListenerScript(),
  });
}
