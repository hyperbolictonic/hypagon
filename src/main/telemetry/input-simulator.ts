/**
 * Human-paced synthetic input for the active tab.
 *
 * This class is the public facade: profile and gates, then delegation to three collaborators.
 * `CdpInput` owns the debugger transport and the native fallback, `MouseControl` owns the
 * pointer (glide, click, scroll) and the cursor position, `TextEntry` owns typing, paste and
 * named keys. Splitting them keeps each behaviour readable and lets `/health` report whether
 * the last event was focus-safe (`cdp`) or needed a focused window (`native`).
 *
 * When to use: the chassis and primitives for clicks, typing, key presses and scrolling.
 */
import type { WebContents } from 'electron';
import type { Point, ChaosKinematicsOptions } from './bezier.js';
import { CdpInput } from './cdp-input.js';
import { MouseControl } from './mouse-control.js';
import { TextEntry } from './text-entry.js';
import type { InputTelemetryReporter } from './input-types.js';

export type { InputTelemetryReporter } from './input-types.js';

/** When to use: dispatching human-paced clicks and typing over CDP. */
export class HumanizedInputSimulator {
  /** Human pacing knobs; replaced at runtime by Settings → INPUT. */
  private profile = {
    mouseSpeedPxPerSec: 1400,
    typingWpm: 220,
    clickDwellMs: 55,
  };

  private humanGate?: () => boolean;
  private syntheticMarker?: (at: number) => void;
  private readonly reporter?: InputTelemetryReporter;
  private readonly cdpInput: CdpInput;
  private readonly mouse: MouseControl;
  private readonly text: TextEntry;

  /**
   * Which transport delivered the most recent input event: `cdp` (focus-independent,
   * preferred) or `native` (`webContents.sendInputEvent`, needs OS window focus).
   * Surfaced via `/health` so agents can tell whether input is focus-safe right now.
   */
  public lastInputTransport: 'cdp' | 'native' | null = null;

  constructor(reporter?: InputTelemetryReporter) {
    this.reporter = reporter;
    const isHumanActive = (): boolean => Boolean(this.humanGate?.());
    const markSynthetic = (): void => this.syntheticMarker?.(Date.now());
    const onTransport = (transport: 'cdp' | 'native'): void => {
      this.lastInputTransport = transport;
    };

    this.cdpInput = new CdpInput({ isHumanActive, markSynthetic, onTransport });
    this.mouse = new MouseControl({
      cdp: this.cdpInput,
      speedPxPerSec: () => this.profile.mouseSpeedPxPerSec,
      clickDwellMs: () => this.profile.clickDwellMs,
      ...(reporter === undefined ? {} : { reporter }),
    });
    this.text = new TextEntry({
      cdp: this.cdpInput,
      typingWpm: () => this.profile.typingWpm,
      isHumanActive,
      markSynthetic,
      onTransport,
      ...(reporter === undefined ? {} : { reporter }),
    });
  }

  public setProfile(profile: Partial<typeof this.profile>): void {
    for (const key of Object.keys(this.profile) as Array<keyof typeof this.profile>) {
      const value = profile[key];
      if (typeof value === 'number' && Number.isFinite(value)) this.profile[key] = value;
    }
  }

  public getProfile(): typeof this.profile {
    return { ...this.profile };
  }

  /** Called before every synthetic dispatch: return true to refuse input (human has the wheel). */
  public setHumanGate(gate: () => boolean): void {
    this.humanGate = gate;
  }

  /** Called immediately before dispatching, so the monitor can tell our input from a human's. */
  public setSyntheticMarker(marker: (at: number) => void): void {
    this.syntheticMarker = marker;
  }

  /** Register the letterbox scale of a device-emulated tab (1 clears it). */
  public setViewportScale(webContents: WebContents, scale: number): void {
    this.mouse.setViewportScale(webContents, scale);
  }

  public getCursorPosition(): Point {
    return this.mouse.getCursorPosition();
  }

  /** Moves the mouse smoothly along an organic Bézier trajectory to target coordinates. */
  public async moveMouseTo(webContents: WebContents, target: Point, options?: ChaosKinematicsOptions): Promise<void> {
    return this.mouse.moveMouseTo(webContents, target, options);
  }

  /** Simulates a humanized click: glide, hesitate, mouseDown, dwell, mouseUp, recover. */
  public async clickAt(
    webContents: WebContents,
    target: Point,
    options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number },
  ): Promise<void> {
    return this.mouse.clickAt(webContents, target, options);
  }

  /** Smoothly scrolls the page in incremental chunks simulating mousewheel inertia. */
  public async scrollPage(webContents: WebContents, deltaY: number, chunks: number = 8): Promise<void> {
    return this.mouse.scrollPage(webContents, deltaY, chunks);
  }

  /** Insert text without key events (fallback for components that filter `keydown`). */
  public async insertText(webContents: WebContents, text: string): Promise<boolean> {
    return this.text.insertText(webContents, text);
  }

  /** Paste through the real clipboard, restoring what the human had copied. */
  public async pasteText(webContents: WebContents, text: string): Promise<boolean> {
    return this.text.pasteText(webContents, text);
  }

  /** Types text with humanized cadence, realistic inter-key variance, and word pauses. */
  public async typeText(webContents: WebContents, text: string, options?: { baseSpeedWpm?: number }): Promise<void> {
    return this.text.typeText(webContents, text, options);
  }

  /** Presses an individual key (e.g. 'Enter', 'Tab', 'Escape', 'Backspace', 'ArrowDown'). */
  public async pressKey(webContents: WebContents, key: string): Promise<void> {
    return this.text.pressKey(webContents, key);
  }

  /** Clears the focused field with a trusted select-all + delete (Ctrl+A, Backspace). */
  public async clearFocusedField(webContents: WebContents): Promise<void> {
    return this.text.clearFocusedField(webContents);
  }
}
