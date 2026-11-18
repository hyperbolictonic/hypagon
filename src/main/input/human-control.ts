/**
 * Explicit human control over the browser.
 *
 * Page events are never used to seize control: a synthetic CDP click and a real one
 * look the same to the DOM, and renderer latency previously made the gateway pause
 * itself. Control only moves through `takeOver()` — the human asks for the wheel
 * from the deck (or `POST /human/takeover`); until then the agent owns input.
 *
 * When to use: the bridge, the deck or the MCP server asks whether a person has the
 * wheel, or a person presses TAKE OVER / RESUME. Never infer control from page
 * activity; that is telemetry, not a gate.
 *
 * @remarks The hooks are supplied by the chassis: state fields, logs, the HUD
 * broadcast and the focus nudge stay there, this class owns only the control state.
 */

import type { HumanActivity } from './human-activity.js';

/**
 * When to use: implement this when constructing a `HumanControl` — the chassis
 * supplies the HUD/log/focus hooks so the control state stays framework-free.
 */
export interface HumanControlHost {
  /** Last genuine page event, reported for the HUD. Never gates control. */
  lastHuman: () => HumanActivity | null;
  /** Person pressed TAKE OVER: reflect it in state, logs and focus. */
  onTakeOver: () => void;
  /**
   * Person pressed RESUME. Receives whether control had actually been human so the
   * host can keep its "handed back" log line honest.
   */
  onResume: (wasActive: boolean) => void;
}

/**
 * When to use: the bridge, the deck or the MCP server asks whether a person has the
 * wheel, or a person presses TAKE OVER / RESUME. Never infer control from page
 * activity — that is telemetry, not a gate.
 */
export class HumanControl {
  private active = false;
  private since = 0;

  constructor(private readonly host: HumanControlHost) {}

  public isActive(): boolean {
    return this.active;
  }

  public getStatus(): { active: boolean; activeForMs: number; last: HumanActivity | null } {
    return {
      active: this.active,
      activeForMs: this.active ? Date.now() - this.since : 0,
      last: this.host.lastHuman(),
    };
  }

  /** Give a person the wheel until they explicitly resume the agent. */
  public takeOver(): { control: 'human' } {
    this.active = true;
    this.since = Date.now();
    this.host.onTakeOver();
    return { control: 'human' };
  }

  /** Ctrl+Shift+Space: take control, or hand it back if already human. */
  public toggle(): { control: 'bot' | 'human' } {
    if (this.active) {
      this.resume();
      return { control: 'bot' };
    }
    this.takeOver();
    return { control: 'human' };
  }

  /** Hand control back to the agent. */
  public resume(): { resumed: boolean } {
    const wasActive = this.active;
    this.active = false;
    this.since = 0;
    this.host.onResume(wasActive);
    return { resumed: true };
  }
}
