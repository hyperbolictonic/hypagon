/**
 * The CDP input transport: does this tab have a debugger, send one command, and
 * dispatch with a native fallback.
 *
 * Why a module: input over CDP reaches the renderer regardless of OS window focus,
 * unlike `webContents.sendInputEvent`, which the OS drops whenever another window
 * owns the foreground. Every mouse and key path depends on deciding that correctly,
 * so the decision lives in one place.
 */
import { BrowserWindow, type WebContents } from 'electron';
import { bump } from '../../metrics.js';
import type { Point } from '../bezier.js';
import type { InputState } from './context.js';

/** When to use: `HumanizedInputSimulator` — the pointer and keyboard controllers. */
export class CdpInput {
  private readonly state: InputState;

  constructor(state: InputState) {
    this.state = state;
  }

  /** The tab's debugger, when it is attached. */
  get(webContents: WebContents): Electron.Debugger | null {
    try {
      if (webContents && !webContents.isDestroyed() && webContents.debugger.isAttached()) {
        return webContents.debugger;
      }
    } catch {
      // A destroyed or unattached target simply has no CDP.
    }
    return null;
  }

  /** Send one command; returns false (never throws) when CDP is unavailable. */
  async send(webContents: WebContents, method: string, params: Record<string, unknown>): Promise<boolean> {
    const dbg = this.get(webContents);
    if (!dbg) return false;
    bump('cdp.input');
    try {
      await dbg.sendCommand(method, params);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deliver one input event, preferring CDP and recording which transport was used.
   * `nativeFallback` is only invoked when CDP is unavailable or the command is rejected.
   */
  async dispatch(
    webContents: WebContents,
    method: string,
    params: Record<string, unknown>,
    nativeFallback: () => void,
  ): Promise<void> {
    if (this.state.humanGate?.()) {
      throw new Error(
        'HUMAN_IN_PROGRESS: the human is using the browser — synthetic input is paused. Wait for them to finish (poll /human/status) and re-observe.',
      );
    }
    this.state.syntheticMarker?.(Date.now());
    if (await this.send(webContents, method, params)) {
      this.state.lastInputTransport = 'cdp';
      return;
    }
    this.state.lastInputTransport = 'native';
    try {
      nativeFallback();
    } catch {
      // The native fallback is best-effort; the transport flag already says so.
    }
  }

  /**
   * Prepare the target for synthetic input.
   *
   * With CDP available we only enable focus *emulation* (the page reports
   * `document.hasFocus()`, so focus-gated JS still responds) and never steal the
   * foreground from whatever the human is using. Without CDP we do bring the window
   * forward, because `sendInputEvent` is dropped otherwise.
   */
  ensureTarget(webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    if (this.get(webContents)) {
      void this.send(webContents, 'Emulation.setFocusEmulationEnabled', { enabled: true });
      return;
    }

    try {
      const win = BrowserWindow.fromWebContents(webContents);
      if (win && !win.isDestroyed() && win.isVisible() && !win.isFocused()) {
        try {
          win.show();
        } catch {
          // Windows can refuse to show a window mid-teardown.
        }
        try {
          win.focus();
        } catch {
          // Same.
        }
      }
    } catch {
      // No window for this target.
    }
    try {
      webContents.focus();
    } catch {
      // Focus is best-effort.
    }
  }

  /** Register the letterbox scale of a device-emulated tab (1 clears it). */
  setViewportScale(webContents: WebContents, scale: number): void {
    if (!webContents) return;
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) this.state.viewportScales.set(webContents, scale);
    else this.state.viewportScales.delete(webContents);
  }

  /** Map a CSS point into the native view's DIP space under device emulation. */
  toViewPoint(webContents: WebContents, point: Point): Point {
    const scale = this.state.viewportScales.get(webContents);
    if (!scale) return point;
    return { x: point.x * scale, y: point.y * scale };
  }

  /** The emulation factor for a tab (1 when it is not emulated). */
  viewportFactor(webContents: WebContents): number {
    return this.state.viewportScales.get(webContents) ?? 1;
  }
}
