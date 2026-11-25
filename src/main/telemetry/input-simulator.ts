/**
 * Humanized input over the active tab: the facade the chassis and the primitives hold.
 *
 * Why this file is small: the CDP transport is `input/cdp-input.ts`, the pointer
 * choreography (glide, ghost cursor, click) is `input/pointer.ts`, the keyboard
 * (typing, insert/paste fallbacks, named keys, clear) is `input/keyboard.ts`, the
 * shared profile/gate/cursor state is `input/context.ts`, the key tables are
 * `input/keys.ts` and the in-page cursor overlay is `input/cursor-overlay.ts`.
 *
 * This class wires them and keeps the knobs the app sets at runtime: the cadence
 * profile, the human-takeover gate, the synthetic marker, and the emulation scale.
 */
import type { WebContents } from 'electron';
import { bump } from '../metrics.js';
import { CdpInput } from './input/cdp-input.js';
import { InputState, type HumanProfile, type InputTelemetryReporter } from './input/context.js';
import { HumanKeyboard } from './input/keyboard.js';
import { HumanPointer } from './input/pointer.js';

export type { HumanProfile, InputTelemetryReporter } from './input/context.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** When to use: act/drive and the shield breaker — dispatch humanised pointer and keyboard input. */
export class HumanizedInputSimulator {
  private readonly state: InputState;

  /** The CDP transport: availability, focus emulation and the emulation scale. */
  readonly cdp: CdpInput;
  /** Everything that moves the pointer or clicks. */
  readonly pointer: HumanPointer;
  /** Everything that presses keys. */
  readonly keyboard: HumanKeyboard;

  constructor(reporter?: InputTelemetryReporter) {
    this.state = new InputState(reporter);
    this.cdp = new CdpInput(this.state);
    this.pointer = new HumanPointer(this.state, this.cdp);
    this.keyboard = new HumanKeyboard(this.state, this.cdp);
  }

  /** Replace the pacing knobs; non-finite values are ignored. */
  public setProfile(profile: Partial<HumanProfile>): void {
    for (const key of Object.keys(this.state.profile) as Array<keyof HumanProfile>) {
      const value = profile[key];
      if (typeof value === 'number' && Number.isFinite(value)) this.state.profile[key] = value;
    }
  }

  /** Called before every synthetic dispatch: return true to refuse input (human has the wheel). */
  public setHumanGate(gate: () => boolean): void {
    this.state.humanGate = gate;
  }

  /** Called immediately before dispatching, so the monitor can tell our input from a human's. */
  public setSyntheticMarker(marker: (at: number) => void): void {
    this.state.syntheticMarker = marker;
  }

  /**
   * Which transport delivered the most recent input event: `cdp` (focus-independent,
   * preferred) or `native` (`webContents.sendInputEvent`, needs OS window focus).
   * Surfaced via `/health` so agents can tell whether input is focus-safe right now.
   */
  public get lastInputTransport(): 'cdp' | 'native' | null {
    return this.state.lastInputTransport;
  }

  /** Register the letterbox scale of a device-emulated tab (1 clears it). */
  public setViewportScale(webContents: WebContents, scale: number): void {
    this.cdp.setViewportScale(webContents, scale);
  }

  /** Where the ghost cursor last landed, in CSS pixels. */
  public getCursorPosition() {
    return { ...this.state.cursor };
  }

  /** Smoothly scrolls the page in incremental chunks simulating mousewheel inertia. */
  public async scrollPage(webContents: WebContents, deltaY: number, chunks: number = 8): Promise<void> {
    this.cdp.ensureTarget(webContents);
    bump('action.scroll');
    const step = Math.round(deltaY / chunks);
    for (let i = 0; i < chunks; i++) {
      const viewCursor = this.cdp.toViewPoint(webContents, this.state.cursor);
      await this.cdp.dispatch(
        webContents,
        'Input.dispatchMouseEvent',
        { type: 'mouseWheel', x: viewCursor.x, y: viewCursor.y, deltaX: 0, deltaY: -step, pointerType: 'mouse' },
        () => {
          webContents.sendInputEvent({
            type: 'mouseWheel',
            x: viewCursor.x,
            y: viewCursor.y,
            deltaX: 0,
            deltaY: -step,
            canScroll: true,
          });
        },
      );

      this.state.reporter?.onScroll?.(step);
      await sleep(25 + Math.random() * 20);
    }
  }
}
