/**
 * Humanized input over the active tab: the adapter the chassis and the primitives hold.
 *
 * The portable driver lives in `@hyperbolictonic/hypagon-stealth`: the CDP
 * transport, the pointer choreography, the keyboard and the shared state. This
 * module keeps the app's `WebContents`-shaped API, builds one `ElectronTarget` per
 * web contents, and supplies the Electron fallbacks (native input, clipboard,
 * window focus) plus the metrics counters.
 */
import { BrowserWindow, clipboard, type WebContents } from 'electron';
import type { BrowserTarget } from '../../../packages/browser/src/target.ts';
import { ElectronTarget } from '../../../packages/electron/src/target.ts';
import { electronTargetFor } from '../browser/electron-targets.js';
import { HumanizedInput } from '../../../packages/stealth/src/input/driver.ts';
import type { CdpInput } from '../../../packages/stealth/src/input/cdp-input.ts';
import type {
  ClipboardPort,
  HumanProfile,
  InputTelemetryReporter,
  NativeInputPort,
} from '../../../packages/stealth/src/input/context.ts';
import type { ChaosKinematicsOptions, Point } from '../../../packages/stealth/src/movement/bezier.ts';
import { bump } from '../metrics.js';

export type { HumanProfile, InputTelemetryReporter } from '../../../packages/stealth/src/input/context.ts';

/** Reverse map so the native fallback can reach the view from the target it is handed. */
const pages = new WeakMap<ElectronTarget, WebContents>();

function targetFor(wc: WebContents): ElectronTarget {
  const target = electronTargetFor(wc);
  pages.set(target, wc);
  return target;
}

function wcFor(target: BrowserTarget): WebContents | undefined {
  return pages.get(target as ElectronTarget);
}

/** Electron's `sendInputEvent` fallback, used only when CDP is unavailable. */
const nativeInput: NativeInputPort = {
  mouseMove(target, x, y, movementX, movementY) {
    wcFor(target)?.sendInputEvent({ type: 'mouseMove', x, y, movementX, movementY } as any);
  },
  mouseButton(target, x, y, button, clickCount, phase) {
    wcFor(target)?.sendInputEvent({
      type: phase === 'down' ? 'mouseDown' : 'mouseUp',
      x,
      y,
      button,
      clickCount,
    } as any);
  },
  wheel(target, x, y, deltaY) {
    wcFor(target)?.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: 0, deltaY, canScroll: true } as any);
  },
  key(target, phase, key, modifiers) {
    const type = phase === 'down' ? 'keyDown' : phase === 'up' ? 'keyUp' : 'char';
    wcFor(target)?.sendInputEvent({ type, keyCode: key, ...(modifiers ? { modifiers } : {}) } as any);
  },
  focus(target) {
    const wc = wcFor(target);
    if (!wc || wc.isDestroyed()) return;
    try {
      const win = BrowserWindow.fromWebContents(wc);
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
      wc.focus();
    } catch {
      // Focus is best-effort.
    }
  },
  paste(target) {
    wcFor(target)?.paste();
  },
};

const clipboardPort: ClipboardPort = {
  readText: () => clipboard.readText(),
  writeText: (text) => clipboard.writeText(text),
};

/** The pointer methods that still take the app's `WebContents`. */
export interface SimulatorPointer {
  moveMouseTo(wc: WebContents, point: Point, options?: ChaosKinematicsOptions): Promise<void>;
  clickAt(
    wc: WebContents,
    point: Point,
    options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number },
  ): Promise<void>;
}

/** The keyboard methods that still take the app's `WebContents`. */
export interface SimulatorKeyboard {
  typeText(wc: WebContents, text: string, options?: { baseSpeedWpm?: number }): Promise<void>;
  insertText(wc: WebContents, text: string): Promise<boolean>;
  pasteText(wc: WebContents, text: string): Promise<boolean>;
  pressKey(wc: WebContents, key: string): Promise<void>;
  clearFocusedField(wc: WebContents): Promise<void>;
}

/** When to use: act/drive and the shield breaker — dispatch humanised pointer and keyboard input. */
export class HumanizedInputSimulator {
  private readonly driver: HumanizedInput;

  /** The CDP transport: availability, focus emulation and the emulation scale. */
  readonly cdp: CdpInput;
  /** Everything that moves the pointer or clicks. */
  readonly pointer: SimulatorPointer;
  /** Everything that presses keys. */
  readonly keyboard: SimulatorKeyboard;

  constructor(reporter?: InputTelemetryReporter) {
    this.driver = new HumanizedInput({
      reporter,
      native: nativeInput,
      clipboard: clipboardPort,
      metrics: {
        cdpInput: () => bump('cdp.input'),
        click: () => bump('action.click'),
        type: () => bump('action.type'),
        scroll: () => bump('action.scroll'),
      },
    });
    this.cdp = this.driver.cdp;
    this.pointer = {
      moveMouseTo: (wc, point, options) => this.driver.pointer.moveMouseTo(targetFor(wc), point, options),
      clickAt: (wc, point, options) => this.driver.pointer.clickAt(targetFor(wc), point, options),
    };
    this.keyboard = {
      typeText: (wc, text, options) => this.driver.keyboard.typeText(targetFor(wc), text, options),
      insertText: (wc, text) => this.driver.keyboard.insertText(targetFor(wc), text),
      pasteText: (wc, text) => this.driver.keyboard.pasteText(targetFor(wc), text),
      pressKey: (wc, key) => this.driver.keyboard.pressKey(targetFor(wc), key),
      clearFocusedField: (wc) => this.driver.keyboard.clearFocusedField(targetFor(wc)),
    };
  }

  /** Replace the pacing knobs; non-finite values are ignored. */
  public setProfile(profile: Partial<HumanProfile>): void {
    this.driver.setProfile(profile);
  }

  /** Called before every synthetic dispatch: return true to refuse input (human has the wheel). */
  public setHumanGate(gate: () => boolean): void {
    this.driver.setHumanGate(gate);
  }

  /** Called immediately before dispatching, so the monitor can tell our input from a human's. */
  public setSyntheticMarker(marker: (at: number) => void): void {
    this.driver.setSyntheticMarker(marker);
  }

  /**
   * Which transport delivered the most recent input event: `cdp` (focus-independent,
   * preferred) or `native` (`sendInputEvent`, needs OS window focus).
   * Surfaced via `/health` so agents can tell whether input is focus-safe right now.
   */
  public get lastInputTransport(): 'cdp' | 'native' | null {
    return this.driver.lastInputTransport;
  }

  /** Register the letterbox scale of a device-emulated tab (1 clears it). */
  public setViewportScale(webContents: WebContents, scale: number): void {
    this.driver.setViewportScale(targetFor(webContents), scale);
  }

  /** The stable adapter for a view, shared by input and the consent breaker. */
  public targetFor(webContents: WebContents): ElectronTarget {
    return targetFor(webContents);
  }

  /** A humanised click on an already-resolved target. */
  public clickAt(target: BrowserTarget, point: Point): Promise<void> {
    return this.driver.pointer.clickAt(target, point);
  }

  /** Where the ghost cursor last landed, in CSS pixels. */
  public getCursorPosition() {
    return this.driver.getCursorPosition();
  }

  /** Smoothly scrolls the page in incremental chunks simulating mousewheel inertia. */
  public async scrollPage(webContents: WebContents, deltaY: number, chunks: number = 8): Promise<void> {
    await this.driver.scrollPage(targetFor(webContents), deltaY, chunks);
  }
}
