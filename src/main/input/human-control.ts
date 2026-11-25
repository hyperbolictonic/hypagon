/**
 * Human-control latch.
 *
 * Control only moves when a person asks for it (HUD button, shortcut,
 * `POST /human/takeover`). Page activity is recorded for the HUD but never
 * pauses the agent — synthetic CDP input and real input look the same to the
 * DOM, so page events are not a safe trigger.
 */
import { HumanActivityMonitor, type HumanActivity } from './human-activity.js';

/** Dependencies the latch needs from the agent status and telemetry. */
export interface HumanControlDeps {
  /** Switch the agent status to HUMAN_INPUT and broadcast it. */
  markHuman(): void;
  /** Return an interrupted HUMAN_INPUT status to IDLE and broadcast it. */
  markIdle(): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  /** The informational click-shaped telemetry `note` emits. */
  emitHumanActivity(activity: HumanActivity): void;
  /** Focus the shell window and the active tab after a takeover. */
  focusActiveTab(): void;
  /** The live page URL, used to drop stale activity from another tab. */
  currentUrl(): string;
}

/** The explicit human-takeover latch and its activity monitor. */
export class HumanControlSurface {
  /** The page-activity monitor the input simulator also stamps. */
  readonly monitor = new HumanActivityMonitor();
  private control = false;
  private since = 0;
  private lastNoticeAt = 0;
  private readonly deps: HumanControlDeps;

  constructor(deps: HumanControlDeps) {
    this.deps = deps;
  }

  isActive(): boolean {
    return this.control;
  }

  status(): { active: boolean; activeForMs: number; last: HumanActivity | null } {
    return {
      active: this.control,
      activeForMs: this.control ? Date.now() - this.since : 0,
      last: this.monitor.getLastHuman(),
    };
  }

  /** Give a person the wheel until they explicitly resume the agent. */
  takeOver(): { control: 'human' } {
    this.control = true;
    this.since = Date.now();
    this.deps.markHuman();
    this.deps.log('warn', 'Human took control — synthetic input paused.');
    this.deps.focusActiveTab();
    return { control: 'human' };
  }

  /** Ctrl+Shift+Space: take control, or hand it back if already human. */
  toggle(): { control: 'bot' | 'human' } {
    if (this.control) {
      this.resume();
      return { control: 'bot' };
    }
    this.takeOver();
    return { control: 'human' };
  }

  /** Hand control back to the agent. */
  resume(): { resumed: boolean } {
    const wasHuman = this.control;
    this.control = false;
    this.since = 0;
    this.deps.markIdle();
    if (wasHuman) this.deps.log('info', 'Human handed control back — agent may act again.');
    return { resumed: true };
  }

  /**
   * Record human page activity for telemetry and the HUD, but never pause the bot.
   *
   * Control only moves through `takeOver()`. A note here is informational: the
   * person can click TAKE OVER if they want the wheel.
   */
  note(activity: HumanActivity): void {
    const currentUrl = this.deps.currentUrl();
    if (activity.url && currentUrl && activity.url !== currentUrl) return; // stale tab
    this.deps.emitHumanActivity(activity);
    if (this.control) return;
    const now = Date.now();
    if (now - this.lastNoticeAt < 10_000) return;
    this.lastNoticeAt = now;
    this.deps.log(
      'info',
      `Human input detected (${activity.kind}${activity.target ? `: ${activity.target}` : ''}) — agent still has control; click TAKE OVER to pause.`,
    );
  }
}
