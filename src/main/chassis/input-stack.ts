/**
 * Input/diagnostics stack.
 *
 * Builds the humanized input surface, the shield breaker that clicks through
 * consent walls, the harvester, the marks overlay, and the download/session/
 * network/script surfaces. The chassis supplies the active tab, state and the
 * telemetry sinks; this module owns the construction order.
 */
import type { WebContents } from 'electron';
import type { ChassisState, TelemetryEvent } from '../../shared/types.js';
import { InputSurface } from '../input/input-surface.js';
import { ConstructHarvester } from '../harvester/markdown.js';
import { ShieldBreaker } from '../shield/shield-breaker.js';
import { MarksOverlay } from '../marks/marks-overlay.js';
import { DownloadSurface } from '../downloads/download-surface.js';
import { SessionSurface } from '../session/session-surface.js';
import { NetworkSurface } from '../network/network-surface.js';
import { ScriptsSurface } from '../scripts/scripts-surface.js';

/** Dependencies the input/diagnostics stack needs from the chassis. */
export interface InputStackDeps {
  activeWebContents(): WebContents;
  state: ChassisState;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  pointEvent(type: 'mouse_move' | 'click', point: { x: number; y: number }, details: string): void;
  telemetryEvent(event: TelemetryEvent): void;
  simpleEvent(type: TelemetryEvent['type'], details: string): void;
  reportActing(): void;
  reportIdle(): void;
  emitHarvest(details: string): void;
  broadcastState(): void;
  bumpRevision(): number;
  markSynthetic(at: number): void;
  humanActive(): boolean;
}

/** The built input and diagnostic surfaces. */
export interface InputStack {
  input: InputSurface;
  harvester: ConstructHarvester;
  shieldBreaker: ShieldBreaker;
  marksOverlay: MarksOverlay;
  downloads: DownloadSurface;
  sessions: SessionSurface;
  network: NetworkSurface;
  scripts: ScriptsSurface;
}

/** When to use: the chassis constructor — build the input/diagnostic surfaces once. */
export function createInputStack(deps: InputStackDeps): InputStack {
  const input = new InputSurface({
    activeWebContents: () => deps.activeWebContents(),
    onMouseMove: (point, velocity) => {
      deps.state.cursor = point;
      deps.pointEvent('mouse_move', point, `Velocity: ${velocity.toFixed(2)} px/ms`);
    },
    onClick: (point) => {
      deps.state.stats.totalInteractions++;
      deps.pointEvent('click', point, 'Physical mouse switch actuated');
    },
    onKey: (char, delay) => {
      deps.state.stats.totalInteractions++;
      deps.telemetryEvent({
        type: 'keystroke',
        key: char === ' ' ? 'SPACE' : char,
        durationMs: delay,
        timestamp: Date.now(),
        details: `Cadence variance: ${delay}ms`,
      });
    },
    onScroll: (deltaY) => {
      deps.simpleEvent('scroll', `Mousewheel impulse: ${deltaY}px`);
    },
    markSynthetic: (at) => deps.markSynthetic(at),
    humanActive: () => deps.humanActive(),
    status: {
      acting: () => {
        deps.state.agentStatus = 'SIMULATING_INPUT';
      },
      idle: () => deps.reportIdle(),
      error: () => {
        deps.state.agentStatus = 'ERROR';
        deps.broadcastState();
      },
    },
    log: (level, message) => deps.log(level, message),
    bumpRevision: () => deps.bumpRevision(),
  });

  return {
    input,
    harvester: new ConstructHarvester(),
    shieldBreaker: new ShieldBreaker(input.simulator),
    marksOverlay: new MarksOverlay(),
    downloads: new DownloadSurface({ log: deps.log }),
    sessions: new SessionSurface({
      activeWebContents: () => deps.activeWebContents(),
      log: deps.log,
      emitHarvest: (details) => deps.emitHarvest(details),
    }),
    network: new NetworkSurface({ log: deps.log }),
    scripts: new ScriptsSurface({
      activeWebContents: () => deps.activeWebContents(),
      log: deps.log,
      reportActing: () => deps.reportActing(),
      reportIdle: () => deps.reportIdle(),
      emitHarvest: (details) => deps.emitHarvest(details),
    }),
  };
}
