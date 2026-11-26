/**
 * The humanised input driver: the facade a host holds for one browser session.
 *
 * The CDP transport is `cdp-input.ts`, the pointer choreography (glide, ghost
 * cursor, click) is `pointer.ts`, the keyboard (typing, insert/paste fallbacks,
 * named keys, clear) is `keyboard.ts`, and the shared profile/gate/cursor state is
 * `context.ts`.
 *
 * Portable: every method takes a `BrowserTarget`. Optional host ports supply a
 * native fallback, the clipboard and counters.
 */
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';
import { CdpInput } from './cdp-input.ts';
import {
  InputState,
  type ClipboardPort,
  type HumanProfile,
  type InputMetrics,
  type InputTelemetryReporter,
  type NativeInputPort,
} from './context.ts';
import { HumanKeyboard } from './keyboard.ts';
import { HumanPointer } from './pointer.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** When to use: constructing a driver — the telemetry sink and the optional host ports. */
export interface HumanizedInputOptions {
  reporter?: InputTelemetryReporter;
  profile?: Partial<HumanProfile>;
  native?: NativeInputPort;
  clipboard?: ClipboardPort;
  metrics?: InputMetrics;
}

/** When to use: act/drive and the shield breaker — dispatch humanised pointer and keyboard input. */
export class HumanizedInput {
  private readonly state: InputState;

  /** The CDP transport: availability, focus emulation and the emulation scale. */
  readonly cdp: CdpInput;
  /** Everything that moves the pointer or clicks. */
  readonly pointer: HumanPointer;
  /** Everything that presses keys. */
  readonly keyboard: HumanKeyboard;

  constructor(options: HumanizedInputOptions = {}) {
    this.state = new InputState(options.reporter);
    this.state.native = options.native;
    this.state.clipboard = options.clipboard;
    this.state.metrics = options.metrics;
    this.cdp = new CdpInput(this.state);
    this.pointer = new HumanPointer(this.state, this.cdp);
    this.keyboard = new HumanKeyboard(this.state, this.cdp);
    if (options.profile) this.setProfile(options.profile);
  }

  /** Replace the pacing knobs; non-finite values are ignored. */
  setProfile(profile: Partial<HumanProfile>): void {
    for (const key of Object.keys(this.state.profile) as Array<keyof HumanProfile>) {
      const value = profile[key];
      if (typeof value === 'number' && Number.isFinite(value)) this.state.profile[key] = value;
    }
  }

  /** Called before every synthetic dispatch: return true to refuse input (human has the wheel). */
  setHumanGate(gate: () => boolean): void {
    this.state.humanGate = gate;
  }

  /** Called immediately before dispatching, so the monitor can tell our input from a human's. */
  setSyntheticMarker(marker: (at: number) => void): void {
    this.state.syntheticMarker = marker;
  }

  /**
   * Which transport delivered the most recent input event: `cdp` (focus-independent,
   * preferred) or `native` (`sendInputEvent`, needs OS window focus).
   */
  get lastInputTransport(): 'cdp' | 'native' | null {
    return this.state.lastInputTransport;
  }

  /** Register the letterbox scale of a device-emulated target (1 clears it). */
  setViewportScale(target: BrowserTarget, scale: number): void {
    this.cdp.setViewportScale(target, scale);
  }

  /** Where the ghost cursor last landed, in CSS pixels. */
  getCursorPosition() {
    return { ...this.state.cursor };
  }

  /** Smoothly scrolls the page in incremental chunks simulating mousewheel inertia. */
  async scrollPage(target: BrowserTarget, deltaY: number, chunks: number = 8): Promise<void> {
    this.cdp.ensureTarget(target);
    this.state.metrics?.scroll?.();
    const step = Math.round(deltaY / chunks);
    for (let i = 0; i < chunks; i++) {
      const viewCursor = this.cdp.toViewPoint(target, this.state.cursor);
      await this.cdp.dispatch(
        target,
        'Input.dispatchMouseEvent',
        { type: 'mouseWheel', x: viewCursor.x, y: viewCursor.y, deltaX: 0, deltaY: -step, pointerType: 'mouse' },
        () => {
          this.state.native?.wheel?.(target, viewCursor.x, viewCursor.y, -step);
        },
      );

      this.state.reporter?.onScroll?.(step);
      await sleep(25 + Math.random() * 20);
    }
  }
}
