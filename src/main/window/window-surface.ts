/**
 * Window and tray surface.
 *
 * Owns the visibility/focus and close-to-tray behaviour that the window routes
 * and the primitives layer read. The chassis supplies the current window and
 * tray; both are nullable before the window is created or after it closes.
 */
import type { BrowserWindow } from 'electron';
import type { TrayManager } from '../tray/tray-manager.js';

/** Dependencies the window surface needs from the chassis lifecycle. */
export interface WindowSurfaceDeps {
  window(): BrowserWindow | null;
  tray(): TrayManager | null;
}

/** The shell window's visibility, focus and tray behaviour. */
export class WindowSurface {
  constructor(private readonly deps: WindowSurfaceDeps) {}

  setVisible(visible: boolean): void {
    if (visible) {
      this.deps.tray()?.showWindow();
    } else {
      this.deps.tray()?.hideWindow();
    }
  }

  isVisible(): boolean {
    const tray = this.deps.tray();
    return tray ? tray.isWindowVisible() : true;
  }

  /** True when the app window currently owns OS focus (required for synthetic input). */
  isFocused(): boolean {
    try {
      const win = this.deps.window();
      return Boolean(win && !win.isDestroyed() && win.isFocused());
    } catch {
      return false;
    }
  }

  /** Brings the app window to the foreground (best effort). */
  focus(): boolean {
    try {
      const win = this.deps.window();
      if (win && !win.isDestroyed()) {
        if (!win.isVisible()) this.deps.tray()?.showWindow();
        win.show();
        win.focus();
        win.moveTop();
      }
    } catch {}
    return this.isFocused();
  }

  setCloseToTray(enabled: boolean): void {
    this.deps.tray()?.setCloseToTray(enabled);
  }

  isCloseToTray(): boolean {
    const tray = this.deps.tray();
    return tray ? tray.isCloseToTray() : true;
  }
}
