/**
 * The chassis host contract.
 *
 * The composition roots (the stack factories and the IPC surface) need the
 * chassis's live surfaces and a handful of accessors, not the chassis class.
 * `BrowserChassis` satisfies this interface structurally, so each factory can be
 * called as `createX(this)` and the chassis stops carrying a copy of every deps
 * literal.
 */
import type { WebContents } from 'electron';
import type { BrowserWindow } from 'electron';
import type { ChassisState, HarvestedConstruct } from '../../shared/types.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import type { TelemetrySurface } from '../telemetry/telemetry-surface.js';
import type { ShellBus } from '../shell/event-bus.js';
import type { HudWatchdog } from '../boot/hud-watchdog.js';
import type { HumanControlSurface } from '../input/human-control.js';
import type { InputSurface } from '../input/input-surface.js';
import type { TabSetupSurface } from '../tabs/tab-setup.js';
import type { TabSurface } from '../tabs/tab-surface.js';
import type { PageInfo } from '../tabs/page-info.js';
import type { ZoomController } from '../zoom/controller.js';
import type { ViewportController } from '../viewport/controller.js';
import type { DeckController } from '../deck/controller.js';
import type { NavigationSurface } from '../navigation/navigation-surface.js';
import type { PageScriptSurface } from '../browser/page-script-surface.js';
import type { HarvestSurface } from '../harvest/harvest-surface.js';
import type { MarksSurface } from '../marks/marks-surface.js';
import type { MarksOverlay } from '../marks/marks-overlay.js';
import type { ShadowWalkSurface } from '../shadow-walk/shadow-surface.js';
import type { JevController } from '../jev/controller.js';
import type { ConsentController } from '../shield/consent-controller.js';
import type { ResearchSessionSurface } from '../research/research-session-surface.js';
import type { ResearchViewSurface } from '../research/research-view-surface.js';
import type { CrawlSurface } from '../research/crawl-surface.js';
import type { NetworkSurface } from '../network/network-surface.js';
import type { DecisionSurface } from '../decide/decision-surface.js';
import type { ConsoleLogBuffer } from '../diagnostics/console-log.js';
import type { WindowSurface } from '../window/window-surface.js';
import type { Primitives } from '../primitives/primitives.js';
import type { ActionLedger } from '../telemetry/action-ledger.js';
import type { ConstructHarvester } from '../harvester/markdown.js';
import type { TrayManager } from '../tray/tray-manager.js';
import type { HilSurface } from '../hil/hil-surface.js';
import type { DownloadSurface } from '../downloads/download-surface.js';
import type { CollaborationSurface } from '../collaboration/surface.js';
import type { ShieldBreaker, ConsentPolicy } from '../shield/shield-breaker.js';
import type { DownloadNotice } from '../boot/window-boot.js';

/** The chassis surfaces and accessors a composition root may read. */
export interface ChassisHost {
  readonly state: ChassisState;
  readonly hostProfile: HostBrowserProfile;
  readonly telemetry: TelemetrySurface;
  readonly bus: ShellBus;
  readonly hud: HudWatchdog;
  readonly window: WindowSurface;
  readonly human: HumanControlSurface;
  readonly input: InputSurface;
  readonly tabSetup: TabSetupSurface;
  readonly tabOps: TabSurface;
  readonly zoom: ZoomController;
  readonly viewport: ViewportController;
  readonly deck: DeckController;
  readonly nav: NavigationSurface;
  readonly page: PageScriptSurface;
  readonly harvest: HarvestSurface;
  readonly marks: MarksSurface;
  readonly marksOverlay: MarksOverlay;
  readonly shadow: ShadowWalkSurface;
  readonly jev: JevController;
  readonly consent: ConsentController;
  readonly research: ResearchSessionSurface;
  readonly researchView: ResearchViewSurface;
  readonly crawl: CrawlSurface;
  readonly network: NetworkSurface;
  readonly downloads: DownloadSurface;
  readonly decision: DecisionSurface;
  readonly consoleLogs: ConsoleLogBuffer;
  readonly hil: HilSurface;
  readonly collaboration: CollaborationSurface;
  readonly shieldBreaker: ShieldBreaker;
  readonly consentPolicy: ConsentPolicy;
  readonly primitives: Primitives;
  readonly actionLedger: ActionLedger;
  readonly harvester: ConstructHarvester;
  /** The latest harvested construct, mirrored to the HUD. */
  latestConstruct: HarvestedConstruct | null;
  /** The tray, or null before the window is created. */
  trayManager: TrayManager | null;
  getActiveWebContents(): WebContents;
  /** The shell window, or null before boot / after close. */
  getMainWindow(): BrowserWindow | null;
  /** Re-assert the native view bounds after a minimize/sleep/display change. */
  reassertViewport(): void;
  /** Render a URL to Markdown through the detached view (the read_url fallback). */
  readUrlRender(url: string): Promise<{ markdown: string; title: string; status: number; contentType: string | null }>;
  /** Drop the JEV depth index before a tab change. */
  purgeJev(): void;
  /** Adopt the shell window (boot step). */
  setMainWindow(win: BrowserWindow): void;
  /** Create the tray bound to the shell window (boot step). */
  createTray(win: BrowserWindow): void;
  /** Register the renderer IPC channels (boot step). */
  registerIpc(): void;
  /** Log a completed download to the HUD and telemetry. */
  logDownload(record: DownloadNotice): void;
  /** The bound log entry point (safe to pass as a callback). */
  log(level: 'info' | 'warn' | 'action', message: string): void;
  getPageInfo(): PageInfo;
  getRevision(): number;
  bumpRevision(): number;
  /** Keep the deck overlay and the emulated tab viewport in step. */
  setViewportVisibility(visible: boolean): void;
}
