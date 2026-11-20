/**
 * The synthetic-cursor trail drawn on the HUD canvas.
 *
 * Shared: the telemetry feed appends points and the canvas renderer drains them, so the array
 * lives here rather than in either module.
 */

/** When to use: appending a cursor sample or draining the trail for a redraw. */
export const cursorTrail: Array<{ x: number; y: number; alpha: number }> = [];
