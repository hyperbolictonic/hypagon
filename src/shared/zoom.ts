/**
 * Page zoom policy and the shape reported to the HUD, IPC callers and MCP.
 *
 * Windows scales the whole UI (150% is common on a 1080p laptop). Without a
 * policy that would also make every web page 1.5x larger than the same page in
 * a browser at 100% display scaling. `compensate` divides the page zoom by the
 * display scale so CSS pixels map back to physical pixels; `native` leaves the
 * page at Windows scale. The human can switch from the toolbar, and the choice
 * is persisted.
 */

/** When to use: choosing between display-scale compensation and native zoom. */
export type ZoomMode = 'compensate' | 'native';

/** When to use: persisting or validating the page-zoom policy. */
export interface ZoomSettings {
  schemaVersion: 1;
  mode: ZoomMode;
}

/** When to use: a fresh profile or a reset to the shipped zoom policy. */
export const DEFAULT_ZOOM_SETTINGS: ZoomSettings = {
  schemaVersion: 1,
  mode: 'compensate',
};

/** When to use: reading mode, effective factor and rendered CSS/physical proportions. */
export interface ZoomState {
  /** Active policy. */
  mode: ZoomMode;
  /** Windows/monitor scale factor, e.g. 1.5. */
  displayScale: number;
  /** The factor the policy alone would apply. */
  baseFactor: number;
  /** The page zoom actually requested, after a manual override. */
  factor: number;
  /** True when an explicit zoom step/factor is active instead of the policy base. */
  custom: boolean;
  /** CSS pixels to physical pixels: displayScale * factor. */
  devicePixelRatio: number;
  /** The native browsing view, in CSS px and physical px. */
  viewport: {
    css: { width: number; height: number };
    physical: { width: number; height: number };
  };
}

/** When to use: validating a persisted or IPC zoom policy before applying it. */
export function normalizeZoomSettings(input: unknown): ZoomSettings {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULT_ZOOM_SETTINGS };
  }
  const mode = (input as { mode?: unknown }).mode;
  return {
    schemaVersion: 1,
    mode: mode === 'native' ? 'native' : 'compensate',
  };
}

/** Chrome-like zoom stops, used by the toolbar and the agent-facing tool. */
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;

/** When to use: stepping zoom like Chrome (in/out) through the fixed ladder. */
export function nextZoomStep(current: number, direction: 'in' | 'out'): number {
  // A fitted factor is usually 1/1.5 = 0.6667, one hair below the 0.67 stop.
  // Require a visible 2% change so the first click does not feel like a no-op.
  if (direction === 'in') {
    return ZOOM_STEPS.find((step) => step > current * 1.02) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  return [...ZOOM_STEPS].reverse().find((step) => step < current / 1.02) ?? ZOOM_STEPS[0];
}

/** When to use: bounding an exact zoom factor to the supported range. */
export function clampZoomFactor(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(0.25, Math.round(value * 1000) / 1000));
}
