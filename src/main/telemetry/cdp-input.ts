/**
 * The CDP transport for synthetic input.
 *
 * Input dispatched over CDP (`Input.dispatch*`) reaches the renderer regardless of OS window
 * focus, unlike Electron's `webContents.sendInputEvent`, which the OS silently drops whenever
 * another window owns the foreground. The native path stays as a fallback, and every dispatch
 * records which one ran so `/health` can say whether input is focus-safe right now.
 *
 * When to use: `MouseControl` and `TextEntry` for every event they send.
 */
import { BrowserWindow, type WebContents } from 'electron';
import { bump } from '../metrics.js';

/** When to use: connecting the transport to the simulator's gate and status field. */
export interface CdpInputHooks {
  /** True while the human has the wheel; synthetic input must refuse. */
  readonly isHumanActive: () => boolean;
  /** Marks the next dispatch as ours, so the activity monitor can tell it from a human's. */
  readonly markSynthetic: () => void;
  /** Records which transport delivered the last event. */
  readonly onTransport: (transport: 'cdp' | 'native') => void;
}

/** When to use: one per simulator — the tab's debugger, its fallback, and focus emulation. */
export class CdpInput {
  private readonly hooks: CdpInputHooks;

  constructor(hooks: CdpInputHooks) {
    this.hooks = hooks;
  }

  /** When to use: checking whether CDP input is available before choosing a path. */
  available(webContents: WebContents): Electron.Debugger | null {
    try {
      if (webContents && !webContents.isDestroyed() && webContents.debugger.isAttached()) {
        return webContents.debugger;
      }
    } catch {}
    return null;
  }

  /** Sends a CDP command; returns false (never throws) when CDP is unavailable. */
  async send(webContents: WebContents, method: string, params: Record<string, unknown>): Promise<boolean> {
    const dbg = this.available(webContents);
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
   * Delivers one input event, preferring CDP and recording which transport was used.
   * `nativeFallback` is only invoked when CDP is unavailable or the command is rejected.
   */
  async dispatch(
    webContents: WebContents,
    method: string,
    params: Record<string, unknown>,
    nativeFallback: () => void,
  ): Promise<void> {
    if (this.hooks.isHumanActive()) {
      throw new Error('HUMAN_IN_PROGRESS: the human is using the browser — synthetic input is paused. Wait for them to finish (poll /human/status) and re-observe.');
    }
    this.hooks.markSynthetic();
    if (await this.send(webContents, method, params)) {
      this.hooks.onTransport('cdp');
      return;
    }
    this.hooks.onTransport('native');
    try {
      nativeFallback();
    } catch {}
  }

  /**
   * Prepares the target for synthetic input.
   *
   * With CDP available we only enable focus *emulation* (the page reports `document.hasFocus()`,
   * so focus-gated JS still responds) and never steal the foreground from whatever the human is
   * using. Without CDP the native path needs a focused window, so we bring it forward.
   */
  ensureTarget(webContents: WebContents): void {
    if (!webContents || webContents.isDestroyed()) return;

    if (this.available(webContents)) {
      void this.send(webContents, 'Emulation.setFocusEmulationEnabled', { enabled: true });
      return;
    }

    try {
      const win = BrowserWindow.fromWebContents(webContents);
      if (win && !win.isDestroyed() && win.isVisible() && !win.isFocused()) {
        try { win.show(); } catch {}
        try { win.focus(); } catch {}
      }
    } catch {}
    try { webContents.focus(); } catch {}
  }
}
