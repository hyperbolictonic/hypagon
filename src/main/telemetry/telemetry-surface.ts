/**
 * Log, state-broadcast and telemetry surface.
 *
 * Every controller and route reports through this one surface: it keeps the
 * bounded log ring, stamps the telemetry events and re-broadcasts the chassis
 * state with fresh zoom/viewport/history facts. The chassis supplies the live
 * state object and the renderer fan-out, so the surface owns no window of its
 * own.
 */
import type { WebContents } from 'electron';
import type { ChassisState, TelemetryEvent } from '../../shared/types.js';
import type { ViewportState } from '../../shared/viewport.js';
import type { ZoomState } from '../../shared/zoom.js';

/** One HUD log line; newest entries sit at the head of the ring. */
export interface LogEntry {
  id: string;
  time: string;
  level: 'info' | 'warn' | 'action';
  message: string;
}

/** Dependencies the telemetry surface needs from the chassis and its renderers. */
export interface TelemetrySurfaceDeps {
  /** The live chassis state; the surface mutates it in place before broadcasting. */
  state: ChassisState;
  /** Fan out to the shell window and the deck panel. */
  send(channel: string, payload: unknown): void;
  zoomState(): ZoomState;
  viewportState(): ViewportState | undefined;
  /** The active tab's web contents, or null when there is no usable tab. */
  activeWebContents(): WebContents | null;
}

/** The log ring, state broadcast and telemetry fan-out shared by every chassis surface. */
export class TelemetrySurface {
  private readonly log: LogEntry[] = [];

  constructor(private readonly deps: TelemetrySurfaceDeps) {}

  /** The newest-first log ring the HUD reads on boot. */
  entries(): LogEntry[] {
    return this.log;
  }

  /** Recompute the cheap live facts and push the whole state to the renderers. */
  broadcastState(): void {
    const state = this.deps.state;
    state.zoom = this.deps.zoomState();
    state.viewport = this.deps.viewportState();
    // History availability is read at broadcast time, not cached on navigation: SPAs use pushState,
    // which fires no navigation event, and a tab switch swaps the history stack under the toolbar.
    try {
      const wc = this.deps.activeWebContents();
      if (wc && !wc.isDestroyed()) {
        state.canGoBack = wc.navigationHistory.canGoBack();
        state.canGoForward = wc.navigationHistory.canGoForward();
      }
    } catch {
      // A tab mid-teardown has no usable history; leave the previous flags alone.
    }
    this.deps.send('chassis:state-updated', state);
  }

  /**
   * The two states an agent-driven input action moves through. Every action
   * begins acting and ends idle; the trailing per-action work (bumpRevision,
   * telemetry, the returned summary) stays at the call site.
   */
  reportActing(): void {
    this.deps.state.agentStatus = 'SIMULATING_INPUT';
    this.broadcastState();
  }

  reportIdle(): void {
    this.deps.state.agentStatus = 'IDLE';
    this.broadcastState();
  }

  /** The telemetry events that carry only a type and a details string. */
  emitSimpleEvent(type: TelemetryEvent['type'], details: string): void {
    this.emitTelemetry({ type, timestamp: Date.now(), details });
  }

  emitTelemetry(event: TelemetryEvent): void {
    this.deps.send('chassis:telemetry', event);
  }

  /** The point-shaped events (mouse_move, click) the simulator reports. */
  emitPointEvent(type: 'mouse_move' | 'click', point: { x: number; y: number }, details: string): void {
    this.emitTelemetry({
      type,
      x: point.x,
      y: point.y,
      timestamp: Date.now(),
      details,
    });
  }

  /** The harvest-shaped events (session save/restore and the construct path). */
  emitHarvestDetails(details: string): void {
    this.emitTelemetry({
      type: 'harvest',
      timestamp: Date.now(),
      details,
    });
  }

  addLog(level: 'info' | 'warn' | 'action', message: string): void {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      level,
      message,
    };
    this.log.unshift(entry);
    if (this.log.length > 100) this.log.pop();

    this.deps.send('chassis:log', entry);
  }
}
