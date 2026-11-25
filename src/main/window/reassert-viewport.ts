/**
 * Native-view recovery.
 *
 * A packaged window can come back from minimise, sleep or a monitor change with
 * its native views out of step with the deck and the page bounds. Re-asserting
 * is the same four steps every caller needs; the chassis and the HUD watchdog
 * share this one implementation.
 */
import type { BrowserWindow } from 'electron';
import type { TabManager } from '../tabs/tab-manager.js';

/** When to use: after show/restore/focus/resume — re-position the deck and repaint every view. */
export function reassertViewport(
  win: BrowserWindow | null,
  positionDeck: () => void,
  manager: TabManager | null,
): void {
  if (!win || win.isDestroyed()) return;
  try {
    positionDeck();
  } catch {
    // A settings surface can temporarily hide the sidebar.
  }
  manager?.updateActiveTabBounds();
  try {
    win.webContents.invalidate();
  } catch {
    // Window is closing.
  }
  for (const tab of manager?.allTabs() ?? []) {
    try {
      if (!tab.view.webContents.isDestroyed()) tab.view.webContents.invalidate();
    } catch {
      // Tab closed during the sweep.
    }
  }
}
