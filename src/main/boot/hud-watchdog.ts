/**
 * HUD watchdog.
 *
 * The renderer can stop painting without exiting. This keeps the heartbeat and,
 * when it goes quiet while the window is visible, reloads the HUD once and
 * re-asserts the native view bounds. It also owns the one-time display/power
 * listeners that lose native views on resume or monitor changes.
 */
import { powerMonitor, screen, type BrowserWindow } from 'electron';

/** Dependencies the watchdog needs from the shell window and views. */
export interface HudWatchdogDeps {
  window(): BrowserWindow | null;
  reassertViewport(): void;
  applyZoomToAllTabs(): void;
  logEvent(name: string): void;
}

/** The HUD heartbeat and viewport-recovery watchdog. */
export class HudWatchdog {
  private lastHeartbeat = Date.now();
  private systemListenersBound = false;
  private readonly deps: HudWatchdogDeps;

  constructor(deps: HudWatchdogDeps) {
    this.deps = deps;
  }

  /** Record a heartbeat (boot, renderer message, resume). */
  touch(): void {
    this.lastHeartbeat = Date.now();
  }

  /** Start the five-second health poll. */
  start(): void {
    setInterval(() => this.check(), 5000);
  }

  /** Bind the window transitions that can lose a painted frame. */
  watch(win: BrowserWindow): void {
    this.touch();
    const reassert = () => this.deps.reassertViewport();
    win.on('show', reassert);
    win.on('restore', reassert);
    win.on('focus', reassert);

    if (this.systemListenersBound) return;
    this.systemListenersBound = true;
    try {
      powerMonitor.on('resume', () => {
        this.touch();
        reassert();
      });
    } catch {
      // Not available on every platform/test harness.
    }
    try {
      screen.on('display-metrics-changed', () => {
        this.deps.applyZoomToAllTabs();
        reassert();
      });
    } catch {
      // `screen` is unavailable before app.whenReady.
    }
  }

  private check(): void {
    const win = this.deps.window();
    if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) {
      this.touch();
      return;
    }
    if (Date.now() - this.lastHeartbeat < 15_000) return;

    this.touch();
    this.deps.logEvent('hud-heartbeat-lost');
    try {
      win.webContents.reload();
    } catch {
      // Window is closing; nothing to recover.
    }
    this.deps.reassertViewport();
  }
}
