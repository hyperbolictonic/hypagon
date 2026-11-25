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
import type { NetworkSurface } from '../network/network-surface.js';
import type { DecisionSurface } from '../decide/decision-surface.js';
import type { ConsoleLogBuffer } from '../diagnostics/console-log.js';
import type { WindowSurface } from '../window/window-surface.js';
import type { Primitives } from '../primitives/primitives.js';
import type { ActionLedger } from '../telemetry/action-ledger.js';
import type { ConstructHarvester } from '../harvester/markdown.js';
import type { TrayManager } from '../tray/tray-manager.js';

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
  readonly network: NetworkSurface;
  readonly decision: DecisionSurface;
  readonly consoleLogs: ConsoleLogBuffer;
  readonly primitives: Primitives;
  readonly actionLedger: ActionLedger;
  readonly harvester: ConstructHarvester;
  /** The latest harvested construct, mirrored to the HUD. */
  latestConstruct: HarvestedConstruct | null;
  /** The tray, or null before the window is created. */
  trayManager: TrayManager | null;
  getActiveWebContents(): WebContents;
  getPageInfo(): PageInfo;
  getRevision(): number;
  bumpRevision(): number;
  /** Keep the deck overlay and the emulated tab viewport in step. */
  setViewportVisibility(visible: boolean): void;
}
