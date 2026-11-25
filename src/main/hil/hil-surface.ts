/**
 * Human-in-the-loop surface.
 *
 * Owns the HIL manager and the agent-facing operations over it: request a
 * human, resolve/cancel it, read the active request and history, and send a
 * desktop notification. The chassis supplies the active tab, the renderer
 * fan-out, the status change hook and the log.
 */
import type { WebContents } from 'electron';
import {
  HilManager,
  type HilRequest,
  type HilResolution,
  type NotificationOptions,
} from './hil-manager.js';

/** Dependencies the HIL surface needs from the tabs and agent status. */
export interface HilSurfaceDeps {
  /** The active tab, or null before the window exists. */
  activeWebContents(): WebContents | null;
  /** Fan out to the shell and the deck panel; failures must not break the hand-off. */
  broadcast(channel: string, payload: unknown): void;
  /** Report a pending hand-off so the tray and agent status stay in step. */
  onStateChanged(pending: boolean, request: HilRequest | null): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  /** The navigation-shaped telemetry event a HIL request emits. */
  emitNavigation(details: string): void;
}

/** The agent-facing human-in-the-loop and notification surface. */
export class HilSurface {
  /** The manager itself; window binding and status polling read it directly. */
  readonly manager: HilManager;

  private readonly deps: HilSurfaceDeps;

  constructor(deps: HilSurfaceDeps) {
    this.deps = deps;
    this.manager = new HilManager({
      getActiveWebContents: () => this.deps.activeWebContents(),
      broadcastAll: (channel, payload) => this.deps.broadcast(channel, payload),
      onHilStateChanged: (pending, request) => this.deps.onStateChanged(pending, request),
    });
  }

  async request(
    reason: string,
    options?: { url?: string; timeoutSeconds?: number; bringToFront?: boolean },
  ): Promise<HilResolution> {
    this.deps.log('warn', `⚠️ Human Intervention Requested: ${reason}`);
    this.deps.emitNavigation(`HIL Intervention: ${reason}`);
    return this.manager.requestIntervention({
      reason,
      url: options?.url,
      timeoutSeconds: options?.timeoutSeconds,
      bringToFront: options?.bringToFront,
    });
  }

  resolve(id?: string, notes?: string): boolean {
    const success = this.manager.resolveIntervention(id, notes);
    if (success) {
      this.deps.log('info', `Human intervention resolved: ${notes || 'User confirmed.'}`);
    }
    return success;
  }

  cancel(id?: string): boolean {
    return this.manager.cancelIntervention(id);
  }

  active(): HilRequest | null {
    return this.manager.getActiveRequest();
  }

  history(): HilRequest[] {
    return this.manager.getHistory();
  }

  notify(
    title: string,
    message: string,
    urgency?: NotificationOptions['urgency'],
    sound?: boolean,
  ): boolean {
    this.deps.log('info', `Desktop Notification Dispatched: [${title}] ${message}`);
    return this.manager.sendNotification({ title, message, urgency, sound });
  }
}
