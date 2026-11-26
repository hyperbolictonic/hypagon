/**
 * A ready-made humanised host over a `BrowserTarget`.
 *
 * This is the one-call product surface for another app: the browser package
 * supplies marks, frames, harvesting and network capture, this package supplies
 * the pointer/keyboard driver and sealed discovery, and the caller supplies only
 * the target (and any optional policy ports).
 */
import type { BrowserHostOptions, BrowserInputPort } from '../../browser/src/host.ts';
import { createBrowserHost } from '../../browser/src/host.ts';
import type { PrimitivesHost } from '../../browser/src/primitives/contracts.ts';
import { Primitives } from '../../browser/src/primitives/primitives.ts';
import { HumanizedInput } from './input/driver.ts';
import type { ClipboardPort, InputMetrics, InputTelemetryReporter, NativeInputPort } from './input/context.ts';
import { DEFAULT_INPUT_PROFILE, type InputProfile } from './input/profile.ts';
import { DEFAULT_SEALED_SETTINGS, findSealedControls, type SealedSettings } from './shadow/ax-controls.ts';
import { resolveSealedToken } from './shadow/sealed-targets.ts';

/** When to use: `createHumanizedBrowserHost` — the browser host plus the stealth ports. */
export interface HumanizedBrowserHostOptions
  extends Omit<BrowserHostOptions, 'input' | 'findSealed' | 'resolveSealedToken'> {
  /** Pacing knobs; defaults to `DEFAULT_INPUT_PROFILE`. */
  profile?: Partial<InputProfile>;
  /** Shadow Walk policy for sealed discovery. */
  sealed?: SealedSettings;
  reporter?: InputTelemetryReporter;
  native?: NativeInputPort;
  clipboard?: ClipboardPort;
  metrics?: InputMetrics;
}

/** The built host, its facade and the driver (so the caller can set gates/markers). */
export interface HumanizedBrowserTools {
  host: PrimitivesHost;
  primitives: Primitives;
  input: HumanizedInput;
}

/** When to use: another app wiring one target — a complete host with no per-method glue. */
export function createHumanizedBrowserHost(options: HumanizedBrowserHostOptions): PrimitivesHost {
  return createHumanizedBrowserTools(options).host;
}

/** When to use: another app that wants the host and the `Primitives` facade together. */
export function createHumanizedBrowserTools(options: HumanizedBrowserHostOptions): HumanizedBrowserTools {
  const { profile, sealed, reporter, native, clipboard, metrics, ...hostOptions } = options;
  const input = new HumanizedInput({
    profile: { ...DEFAULT_INPUT_PROFILE, ...profile },
    reporter,
    native,
    clipboard,
    metrics,
  });

  const port: BrowserInputPort = {
    click: (target, point, clickOptions) => input.pointer.clickAt(target, point, clickOptions),
    typeText: (target, text) => input.keyboard.typeText(target, text),
    pressKey: (target, key) => input.keyboard.pressKey(target, key),
    moveMouse: (target, point) => input.pointer.moveMouseTo(target, point),
    insertText: (target, text) => input.keyboard.insertText(target, text),
    pasteText: (target, text) => input.keyboard.pasteText(target, text),
    clearFocusedField: (target) => input.keyboard.clearFocusedField(target),
  };

  const settings = sealed ?? DEFAULT_SEALED_SETTINGS;
  const host = createBrowserHost({
    ...hostOptions,
    input: port,
    findSealed: (opts) => findSealedControls(options.target, opts, settings),
    resolveSealedToken: (token) => resolveSealedToken(options.target, token),
  });

  return { host, primitives: new Primitives(host), input };
}
