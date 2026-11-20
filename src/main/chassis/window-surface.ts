/**
 * Window visibility, focus and the close-to-tray preference.
 *
 * The window and tray are owned by the chassis; this surface reads them through getters.
 */
import type { BrowserWindow } from 'electron';

/** When to use: constructing the window surface from the chassis' own services. */
export interface WindowSurfaceDeps {
  mainWindow: () => any;
  trayManager: () => any;
}

/** When to use: `chassis.window` — visibility, focus and close-to-tray. */
export class WindowSurface {
  constructor(private readonly deps: WindowSurfaceDeps) {}

  public setWindowVisibility(visible: boolean, focus = true): void {
    if (visible) {
      this.deps.trayManager()?.showWindow(focus);
    } else {
      this.deps.trayManager()?.hideWindow();
    }
  }

  public isWindowVisible(): boolean {
    return this.deps.trayManager() ? this.deps.trayManager().isWindowVisible() : true;
  }

  /** True when the app window currently owns OS focus (required for synthetic input). */
  public isWindowFocused(): boolean {
    try {
      return Boolean(this.deps.mainWindow() && !this.deps.mainWindow().isDestroyed() && this.deps.mainWindow().isFocused());
    } catch {
      return false;
    }
  }

  /** Brings the app window to the foreground (best effort). */
  public focusWindow(): boolean {
    try {
      if (this.deps.mainWindow() && !this.deps.mainWindow().isDestroyed()) {
        if (!this.deps.mainWindow().isVisible()) this.deps.trayManager()?.showWindow();
        this.deps.mainWindow().show();
        this.deps.mainWindow().focus();
        this.deps.mainWindow().moveTop();
      }
    } catch {}
    return this.isWindowFocused();
  }

  public setCloseToTray(enabled: boolean): void {
    this.deps.trayManager()?.setCloseToTray(enabled);
  }

  public isCloseToTray(): boolean {
    return this.deps.trayManager() ? this.deps.trayManager().isCloseToTray() : true;
  }
}
