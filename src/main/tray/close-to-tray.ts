/**
 * "Minimize to tray on close": the close interception, the flag the menu checkbox reads, and the
 * quit flag that lets a real close through.
 *
 * Why a module: a close is only intercepted when the setting is on *and* the app is not quitting,
 * and the first interception raises a one-time notice. Three flags and one listener are easier to
 * trust in one object than spread over the tray manager.
 */
import { app, type BrowserWindow } from 'electron';

/** When to use: `new TrayManager` — the window to watch plus the manager's callbacks. */
export interface CloseToTrayDeps {
  window: BrowserWindow;
  /** The initial setting (`closeToTrayDefault`). */
  enabled: boolean;
  /** Hide the window the way a tray click would (and refresh the menu). */
  hide: () => void;
  /** Raise the one-time "still running" notice. */
  onFirstHide: () => void;
}

/** When to use: `TrayManager.closeToTray` — one per tray. */
export class CloseToTray {
  private readonly deps: CloseToTrayDeps;
  private enabled: boolean;
  private quitting = false;
  private noticed = false;

  constructor(deps: CloseToTrayDeps) {
    this.deps = deps;
    this.enabled = deps.enabled;

    // Intercept close to minimize to the tray, but never once the app is quitting.
    deps.window.on('close', (event) => {
      if (this.quitting || !this.enabled) return;
      event.preventDefault();
      deps.hide();
      if (!this.noticed) {
        this.noticed = true;
        deps.onFirstHide();
      }
    });

    app.on('before-quit', () => {
      this.quitting = true;
    });
  }

  /** The setting as the menu checkbox and the window routes see it. */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Turn close-to-tray on or off (the menu checkbox and the HTTP route). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** A real quit started (the tray's Quit item), so a close must go through. */
  beginQuit(): void {
    this.quitting = true;
  }
}
