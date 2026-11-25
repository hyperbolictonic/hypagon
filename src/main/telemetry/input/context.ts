/**
 * The state every input controller reads: the human cadence profile, the ghost
 * cursor's position, the human-takeover gate, the synthetic marker, the transport
 * of the last event and the per-tab emulation scale.
 *
 * Why a module: the pointer, the keyboard and the CDP transport all need the same
 * seven values. Holding them in a plain object (rather than in the facade) is what
 * lets the three controllers be independent.
 */
import type { WebContents } from 'electron';
import type { Point } from '../bezier.js';

/** When to use: a caller that wants input telemetry (the HUD and the replay recorder). */
export interface InputTelemetryReporter {
  onMouseMove?: (point: Point, velocity: number) => void;
  onClick?: (point: Point) => void;
  onKey?: (char: string, delay: number) => void;
  onScroll?: (deltaY: number) => void;
}

/** The human pacing knobs; replaced at runtime by Settings → INPUT. */
export interface HumanProfile {
  mouseSpeedPxPerSec: number;
  typingWpm: number;
  clickDwellMs: number;
}

/** When to use: `HumanizedInputSimulator` — one state object per simulator. */
export class InputState {
  /** Where the ghost cursor last landed, in CSS pixels. */
  cursor: Point = { x: 100, y: 100 };
  /** Human pacing knobs. */
  profile: HumanProfile = {
    mouseSpeedPxPerSec: 1400,
    typingWpm: 220,
    clickDwellMs: 55,
  };
  /** Return true to refuse synthetic input (a human has the wheel). */
  humanGate?: () => boolean;
  /** Called immediately before dispatching, so the monitor can tell our input from a human's. */
  syntheticMarker?: (at: number) => void;
  /**
   * Which transport delivered the most recent event: `cdp` (focus-independent,
   * preferred) or `native` (`sendInputEvent`, needs OS window focus).
   */
  lastInputTransport: 'cdp' | 'native' | null = null;
  /** Per-WebContents emulation scale: CSS coordinates become view coordinates by multiplying. */
  readonly viewportScales = new WeakMap<WebContents, number>();

  constructor(readonly reporter?: InputTelemetryReporter) {}
}
