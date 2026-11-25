/**
 * Input/diagnostics stack.
 *
 * Builds the humanized input surface, the shield breaker that clicks through
 * consent walls, the harvester, the marks overlay, and the download/session/
 * network/script surfaces. The chassis supplies the active tab, state and the
 * telemetry sinks; this module owns the construction order.
 */
import { InputSurface } from '../input/input-surface.js';
import { ConstructHarvester } from '../harvester/markdown.js';
import { ShieldBreaker } from '../shield/shield-breaker.js';
import { MarksOverlay } from '../marks/marks-overlay.js';
import { DownloadSurface } from '../downloads/download-surface.js';
import { SessionSurface } from '../session/session-surface.js';
import { NetworkSurface } from '../network/network-surface.js';
import { ScriptsSurface } from '../scripts/scripts-surface.js';
import type { ChassisHost } from './host.js';

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
export function createInputStack(host: ChassisHost): InputStack {
  const input = new InputSurface({
    activeWebContents: () => host.getActiveWebContents(),
    onMouseMove: (point, velocity) => {
      host.state.cursor = point;
      host.telemetry.emitPointEvent('mouse_move', point, `Velocity: ${velocity.toFixed(2)} px/ms`);
    },
    onClick: (point) => {
      host.state.stats.totalInteractions++;
      host.telemetry.emitPointEvent('click', point, 'Physical mouse switch actuated');
    },
    onKey: (char, delay) => {
      host.state.stats.totalInteractions++;
      host.telemetry.emitTelemetry({
        type: 'keystroke',
        key: char === ' ' ? 'SPACE' : char,
        durationMs: delay,
        timestamp: Date.now(),
        details: `Cadence variance: ${delay}ms`,
      });
    },
    onScroll: (deltaY) => {
      host.telemetry.emitSimpleEvent('scroll', `Mousewheel impulse: ${deltaY}px`);
    },
    markSynthetic: (at) => host.human.monitor.markSynthetic(at),
    humanActive: () => host.human.isActive(),
    status: {
      acting: () => {
        host.state.agentStatus = 'SIMULATING_INPUT';
      },
      idle: () => host.telemetry.reportIdle(),
      error: () => {
        host.state.agentStatus = 'ERROR';
        host.telemetry.broadcastState();
      },
    },
    log: host.log,
    bumpRevision: () => host.bumpRevision(),
  });

  return {
    input,
    harvester: new ConstructHarvester(),
    shieldBreaker: new ShieldBreaker(input.simulator),
    marksOverlay: new MarksOverlay(),
    downloads: new DownloadSurface({ log: host.log }),
    sessions: new SessionSurface({
      activeWebContents: () => host.getActiveWebContents(),
      log: host.log,
      emitHarvest: (details) => host.telemetry.emitHarvestDetails(details),
    }),
    network: new NetworkSurface({ log: host.log }),
    scripts: new ScriptsSurface({
      activeWebContents: () => host.getActiveWebContents(),
      log: host.log,
      reportActing: () => host.telemetry.reportActing(),
      reportIdle: () => host.telemetry.reportIdle(),
      emitHarvest: (details) => host.telemetry.emitHarvestDetails(details),
    }),
  };
}
