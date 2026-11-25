/**
 * Harvest, marks and navigation stack.
 *
 * Builds the three surfaces in dependency order — the marks surface (badges and
 * target resolution), the harvest surface (grounded Markdown plus the screenshot
 * store) and the navigation surface (welcome page, prerender, consent sweep) —
 * so the chassis constructor only assembles the result.
 */
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
import { cortex } from '../cortex/cortex-db.js';
import type { ShadowWalkSurface as ShadowWalkSurfaceName } from '../shadow-walk/settings.js';

/** Dependencies the harvest/marks/navigation stack needs from the chassis. */
export interface HarvestNavStackDeps {
  activeWebContents(): WebContents;
  revision(): number;
  marksOverlay: MarksOverlay;
  simulator: {
    clickAt(wc: WebContents, point: { x: number; y: number }): Promise<void>;
    clearFocusedField(wc: WebContents): Promise<void>;
    typeText(wc: WebContents, text: string): Promise<void>;
  };
  log(level: 'info' | 'warn' | 'action', message: string): void;
  /** The telemetry sink the screenshot store tails. */
  telemetry(event: TelemetryEvent): void;
  reportActing(): void;
  reportIdle(): void;
  emitClick(point: { x: number; y: number }, details: string): void;
  bumpRevision(): number;
  viewportBounds(): { x: number; y: number; width: number; height: number };
  zoomState(): ZoomState;
  harvester: ConstructHarvester;
  beginHarvest(): void;
  onConstruct(construct: HarvestedConstruct): void;
  addTokens(tokens: number): void;
  emitHarvest(details: string): void;
  indexPage(url: string, title: string, content: string): Promise<number>;
  hostProfile: HostBrowserProfile;
  createTab(url: string, view?: WebContentsView): void;
  welcomePagePath(): string | undefined;
  beginTraversal(): void;
  bumpNav(): void;
  purgeJev(): void;
  syncForceOpen(wc: WebContents): Promise<unknown>;
  scheduleConsentSweep(): void;
  broadcastState(): void;
  /** The Shadow Walk surfaces the marks surface must refuse when disabled. */
  refuseShadow(surface: ShadowWalkSurfaceName): void;
}

/** The built harvest/marks/navigation surfaces plus the prerender engine. */
export interface HarvestNavStack {
  marks: MarksSurface;
  harvest: HarvestSurface;
  nav: NavigationSurface;
  prerender: PrerenderEngine;
}

/** When to use: the chassis constructor — build marks, harvest and navigation once. */
export function createHarvestNavStack(deps: HarvestNavStackDeps): HarvestNavStack {
  const screenshotStore = new ScreenshotStore({
    log: deps.log,
    telemetry: deps.telemetry,
  });

  const marks = new MarksSurface({
    activeWebContents: () => deps.activeWebContents(),
    revision: () => deps.revision(),
    marksOverlay: deps.marksOverlay,
    simulator: {
      clickAt: (wc, point) => deps.simulator.clickAt(wc, point),
      clearFocusedField: (wc) => deps.simulator.clearFocusedField(wc),
      typeText: (wc, text) => deps.simulator.typeText(wc, text),
    },
    refuseShadow: (surface) => deps.refuseShadow(surface),
    log: deps.log,
    reportActing: () => deps.reportActing(),
    reportIdle: () => deps.reportIdle(),
    emitClick: (point, details) => deps.emitClick(point, details),
    bumpRevision: () => deps.bumpRevision(),
  });

  const harvest = new HarvestSurface({
    activeWebContents: () => deps.activeWebContents(),
    viewportBounds: () => deps.viewportBounds(),
    zoomState: () => deps.zoomState(),
    marks,
    marksOverlay: deps.marksOverlay,
    harvester: deps.harvester,
    screenshotStore,
    beginHarvest: () => deps.beginHarvest(),
    onConstruct: (construct) => deps.onConstruct(construct),
    addTokens: (tokens) => deps.addTokens(tokens),
    reportIdle: () => deps.reportIdle(),
    emitHarvest: (details) => deps.emitHarvest(details),
    log: deps.log,
    indexPage: (url, title, content) => deps.indexPage(url, title, content),
  });

  const prerender = new PrerenderEngine(
    deps.hostProfile,
    cortex,
    (level, message) => deps.log(level, message),
  );

  const nav = new NavigationSurface({
    activeWebContents: () => deps.activeWebContents(),
    welcomePagePath: () => deps.welcomePagePath(),
    createTab: (url, view) => deps.createTab(url, view),
    prerender: {
      normalizeUrl: (url) => prerender.normalizeUrl(url),
      has: (url) => prerender.has(url),
      consume: (url) => prerender.consume(url),
    },
    beginTraversal: () => deps.beginTraversal(),
    log: deps.log,
    bumpNav: () => deps.bumpNav(),
    purgeJev: () => deps.purgeJev(),
    syncForceOpen: (wc) => deps.syncForceOpen(wc),
    scheduleConsentSweep: () => deps.scheduleConsentSweep(),
    bumpRevision: () => deps.bumpRevision(),
    broadcastState: () => deps.broadcastState(),
  });

  return { marks, harvest, nav, prerender };
}
