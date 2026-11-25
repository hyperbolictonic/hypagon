/**
 * Harvest, marks and navigation stack.
 *
 * Builds the three surfaces in dependency order — the marks surface (badges and
 * target resolution), the harvest surface (grounded Markdown plus the screenshot
 * store) and the navigation surface (welcome page, prerender, consent sweep) —
 * so the chassis constructor only assembles the result.
 */
import { activeWebContents, bumpRevision, currentRevision } from './accessors.js';
import type { WebContents, WebContentsView } from 'electron';
import type { HarvestedConstruct, TelemetryEvent } from '../../shared/types.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import type { ZoomState } from '../../shared/zoom.js';
import { MarksSurface } from '../marks/marks-surface.js';
import { MarksOverlay } from '../marks/marks-overlay.js';
import { HarvestSurface } from '../harvest/harvest-surface.js';
import { ScreenshotStore } from '../harvest/screenshots.js';
import { NavigationSurface } from '../navigation/navigation-surface.js';
import type { ConstructHarvester } from '../harvester/markdown.js';
import { PrerenderEngine } from '../prerender/prerender-engine.js';
import { normalizePrerenderUrl } from '../prerender/url.js';
import { cortex } from '../cortex/cortex-db.js';
import { assertShadowSurface } from '../shadow-walk/guard.js';
import { bump } from '../metrics.js';
import type { ChassisHost } from './host.js';

/** The built harvest/marks/navigation surfaces plus the prerender engine. */
export interface HarvestNavStack {
  marks: MarksSurface;
  harvest: HarvestSurface;
  nav: NavigationSurface;
  prerender: PrerenderEngine;
}

/** When to use: the chassis constructor — build marks, harvest and navigation once. */
export function createHarvestNavStack(host: ChassisHost): HarvestNavStack {
  const screenshotStore = new ScreenshotStore({
    log: host.log,
    telemetry: (event) => host.telemetry.emitTelemetry(event),
  });

  const marks = new MarksSurface({
    activeWebContents: () => activeWebContents(host),
    revision: () => currentRevision(host),
    marksOverlay: host.marksOverlay,
    simulator: {
      pointer: { clickAt: (wc, point) => host.input.simulator.pointer.clickAt(wc, point) },
      keyboard: {
        clearFocusedField: (wc) => host.input.simulator.keyboard.clearFocusedField(wc),
        typeText: (wc, text) => host.input.simulator.keyboard.typeText(wc, text),
      },
    },
    refuseShadow: (surface) => assertShadowSurface(surface),
    log: host.log,
    reportActing: () => host.telemetry.reportActing(),
    reportIdle: () => host.telemetry.reportIdle(),
    emitClick: (point, details) => host.telemetry.emitPointEvent('click', point, details),
    bumpRevision: () => bumpRevision(host),
  });

  const harvest = new HarvestSurface({
    activeWebContents: () => activeWebContents(host),
    viewportBounds: () => host.tabSetup.bounds(),
    zoomState: () => host.zoom.getState(),
    marks,
    marksOverlay: host.marksOverlay,
    harvester: host.harvester,
    screenshotStore,
    beginHarvest: () => {
      host.state.agentStatus = 'HARVESTING';
      host.telemetry.broadcastState();
    },
    onConstruct: (construct) => {
      host.latestConstruct = construct;
      host.bus.toSurfaces('chassis:construct-harvested', construct);
    },
    addTokens: (tokens) => {
      host.state.stats.tokensHarvested += tokens;
    },
    reportIdle: () => host.telemetry.reportIdle(),
    emitHarvest: (details) => host.telemetry.emitSimpleEvent('harvest', details),
    log: host.log,
    indexPage: (url, title, content) => cortex.history.indexPage(url, title, content),
  });

  const prerender = new PrerenderEngine(
    host.hostProfile,
    cortex,
    host.log,
  );

  const nav = new NavigationSurface({
    activeWebContents: () => activeWebContents(host),
    welcomePagePath: () => host.tabSetup.manager?.getWelcomePagePath(),
    createTab: (url, view) => host.tabSetup.manager?.createTab(url, view),
    prerender: {
      normalizeUrl: (url) => normalizePrerenderUrl(url),
      has: (url) => prerender.has(url),
      consume: (url) => prerender.consume(url),
    },
    beginTraversal: () => {
      host.state.agentStatus = 'TRAVERSING';
      host.telemetry.broadcastState();
    },
    log: host.log,
    bumpNav: () => bump('nav'),
    purgeJev: () => host.jev.purge(),
    syncForceOpen: (wc) => host.shadow.syncForceOpen(wc),
    scheduleConsentSweep: () => host.consent.scheduleSweep(),
    bumpRevision: () => bumpRevision(host),
    broadcastState: () => host.telemetry.broadcastState(),
  });

  return { marks, harvest, nav, prerender };
}
