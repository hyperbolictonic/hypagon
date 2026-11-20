/**
 * The telemetry a synthetic input event reports to the HUD.
 *
 * Kept apart from the simulator so the transport, text and pointer modules can type the
 * reporter without importing the facade (which would form a cycle).
 */
import type { Point } from './bezier.js';

/** When to use: receiving pointer/keyboard telemetry from the simulator. */
export interface InputTelemetryReporter {
  onMouseMove?: (point: Point, velocity: number) => void;
  onClick?: (point: Point) => void;
  onKey?: (char: string, delay: number) => void;
  onScroll?: (deltaY: number) => void;
}
