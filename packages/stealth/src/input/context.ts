/**
 * The state every input controller reads: the human cadence profile, the ghost
 * cursor's position, the human-takeover gate, the synthetic marker, the transport
 * of the last event and the per-target emulation scale.
 *
 * Portable: the controller talks to a `BrowserTarget` and to optional host ports
 * (native fallback, clipboard, metrics). No Electron import.
 */
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';
import type { Point } from '../movement/bezier.ts';
import type { InputProfile } from './profile.ts';

/** When to use: a caller that wants input telemetry (the HUD and the replay recorder). */
export interface InputTelemetryReporter {
  onMouseMove?: (point: Point, velocity: number) => void;
  onClick?: (point: Point) => void;
  onKey?: (char: string, delay: number) => void;
  onScroll?: (deltaY: number) => void;
}

/** The human pacing knobs; the app replaces them at runtime from its stored profile. */
export type HumanProfile = InputProfile;

/**
 * When to use: a host that can deliver input without CDP (Electron's
 * `sendInputEvent`). Every method is optional; a host with CDP needs none of them.
 */
export interface NativeInputPort {
  mouseMove?(target: BrowserTarget, x: number, y: number, movementX: number, movementY: number): void;
  mouseButton?(
    target: BrowserTarget,
    x: number,
    y: number,
    button: 'left' | 'right' | 'middle',
    clickCount: number,
    phase: 'down' | 'up',
  ): void;
  wheel?(target: BrowserTarget, x: number, y: number, deltaY: number): void;
  key?(target: BrowserTarget, phase: 'down' | 'up' | 'char', key: string, modifiers?: string[]): void;
  /** Bring the view or window forward when CDP is unavailable. */
  focus?(target: BrowserTarget): void;
  /** Paste from the system clipboard into the focused control. */
  paste?(target: BrowserTarget): void;
}

/** When to use: the keyboard's trusted paste — a host supplies its clipboard. */
export interface ClipboardPort {
  readText?(): Promise<string> | string;
  writeText?(text: string): Promise<void> | void;
}

/** When to use: keeping a host's counters honest without importing its metrics module. */
export interface InputMetrics {
  cdpInput?(): void;
  click?(): void;
  type?(): void;
  scroll?(): void;
}

/** When to use: `HumanizedInput` — one state object per driver. */
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
  /** Per-target emulation scale: CSS coordinates become view coordinates by multiplying. */
  readonly viewportScales = new WeakMap<BrowserTarget, number>();
  /** Optional native fallback. */
  native?: NativeInputPort;
  /** Optional system clipboard. */
  clipboard?: ClipboardPort;
  /** Optional host counters. */
  metrics?: InputMetrics;

  constructor(reporter?: InputTelemetryReporter) {
    this.reporter = reporter;
  }

  readonly reporter?: InputTelemetryReporter;
}
