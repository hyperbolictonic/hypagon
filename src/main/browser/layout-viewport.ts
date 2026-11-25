/**
 * The CDP layout viewport.
 *
 * `Page.getLayoutMetrics` reports the viewport in two shapes depending on the
 * Chromium version (`cssLayoutViewport` or `layoutViewport`). Frame geometry and
 * the shadow-walk scanner need the same normalised rect, so it lives here rather
 * than in either caller.
 */

/** A viewport rect in CSS pixels, origin at the top-left of the page. */
export interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: reading `Page.getLayoutMetrics` for the top-level viewport size. */
export function layoutViewport(metrics: any): ViewportRect {
  const layout = metrics?.cssLayoutViewport || metrics?.layoutViewport || {};
  return {
    x: 0,
    y: 0,
    width: Number(layout.clientWidth) || 0,
    height: Number(layout.clientHeight) || 0,
  };
}
