/**
 * Display-scale resolution for the page zoom policy.
 *
 * Windows display scaling and Chromium's device scale both affect the CSS page
 * zoom. The zoom controller reads the scale of the window's display and falls
 * back to the primary display before `app.whenReady`.
 */
import { screen, type BrowserWindow } from 'electron';

/** When to use: building the zoom controller — the display scale behind the window. */
export function displayScale(win: BrowserWindow | null): number {
  try {
    if (win && !win.isDestroyed()) {
      return screen.getDisplayMatching(win.getBounds()).scaleFactor || 1;
    }
  } catch {
    // Fall through to the primary display (window not created yet).
  }
  try {
    return screen.getPrimaryDisplay().scaleFactor || 1;
  } catch {
    // `screen` is unavailable before `app.whenReady`; assume unscaled.
    return 1;
  }
}
