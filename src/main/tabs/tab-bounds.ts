/**
 * Where the active tab's native view goes.
 *
 * Why a module: the same expression — "the tab's emulated bounds, or the viewport,
 * and nothing while a settings surface covers the window" — appeared in tab switch,
 * relayout and viewport visibility. One function keeps them from drifting.
 */
import type { TabManagerOptions } from './tab-types.js';

/** The rect a tab's view occupies. */
export interface TabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tucked away, so the view paints nothing (never `hide()`: the page keeps running). */
export const HIDDEN_BOUNDS: TabBounds = { x: 0, y: 0, width: 0, height: 0 };

/** When to use: `switchTab`, relayout and viewport visibility. */
export function boundsFor(options: TabManagerOptions, tabId: string, viewportHidden: boolean): TabBounds {
  if (viewportHidden) return HIDDEN_BOUNDS;
  return options.getTabBounds?.(tabId) ?? options.getViewportBounds();
}
