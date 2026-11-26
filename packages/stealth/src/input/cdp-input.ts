/**
 * The CDP input transport: send one command, and fall back to the host's native
 * input when CDP is unavailable.
 *
 * Input over CDP reaches the renderer regardless of OS window focus, unlike
 * `sendInputEvent`, which the OS drops whenever another window owns the
 * foreground. Every mouse and key path depends on deciding that correctly, so the
 * decision lives in one place.
 */
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';
import type { Point } from '../movement/bezier.ts';
import type { InputState } from './context.ts';

/** When to use: `HumanizedInput` — the pointer and keyboard controllers. */
export class CdpInput {
  private readonly state: InputState;

  constructor(state: InputState) {
    this.state = state;
  }

  /** Send one command; returns false (never throws) when CDP is unavailable. */
  async send(target: BrowserTarget, method: string, params: Record<string, unknown> = {}): Promise<boolean> {
    try {
      this.state.metrics?.cdpInput?.();
      await target.sendCommand(method, params);
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
    target: BrowserTarget,
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
    if (await this.send(target, method, params)) {
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
   * foreground from whatever the human is using. Without CDP we ask the host to
   * bring the view forward, because `sendInputEvent` is dropped otherwise.
   */
  ensureTarget(target: BrowserTarget): void {
    // A host that can answer synchronously takes the native path immediately, matching the
    // old WebContents behaviour (focus before the next dispatch, not after a failed probe).
    if (target.isAttached && !target.isAttached()) {
      this.state.native?.focus?.(target);
      return;
    }
    void this.send(target, 'Emulation.setFocusEmulationEnabled', { enabled: true }).then((ok) => {
      if (!ok) this.state.native?.focus?.(target);
    });
  }

  /** Register the letterbox scale of a device-emulated target (1 clears it). */
  setViewportScale(target: BrowserTarget, scale: number): void {
    if (!target) return;
    if (Number.isFinite(scale) && scale > 0 && scale !== 1) this.state.viewportScales.set(target, scale);
    else this.state.viewportScales.delete(target);
  }

  /** Map a CSS point into the native view's DIP space under device emulation. */
  toViewPoint(target: BrowserTarget, point: Point): Point {
    const scale = this.state.viewportScales.get(target);
    if (!scale) return point;
    return { x: point.x * scale, y: point.y * scale };
  }

  /** The emulation factor for a target (1 when it is not emulated). */
  viewportFactor(target: BrowserTarget): number {
    return this.state.viewportScales.get(target) ?? 1;
  }
}
