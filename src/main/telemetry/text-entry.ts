/**
 * Text entry: human-paced typing, trusted paste, insertText, named keys, and clearing a field.
 *
 * Typing is keyboard-driven on purpose: a real keystroke fires a genuine `input` event (so
 * React/Vue controlled inputs update) and never sets `isTrusted: false`, which is what trips
 * behavioural bot sensors. `insertText` exists as a fallback for components that filter
 * `keydown`, and paste goes through the real clipboard so the control sees a trusted paste.
 *
 * When to use: `HumanizedInputSimulator` for every keyboard-facing method.
 */
import { clipboard, type WebContents } from 'electron';
import { bump } from '../metrics.js';
import { keyDescriptor } from './key-tables.js';
import type { CdpInput } from './cdp-input.js';
import type { InputTelemetryReporter } from './input-types.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** When to use: constructing text entry from the simulator's transport and profile. */
export interface TextEntryHooks {
  readonly cdp: CdpInput;
  readonly typingWpm: () => number;
  readonly isHumanActive: () => boolean;
  readonly markSynthetic: () => void;
  readonly onTransport: (transport: 'cdp' | 'native') => void;
  readonly reporter?: InputTelemetryReporter;
}

/** When to use: one per simulator — all keyboard input goes through here. */
export class TextEntry {
  private readonly hooks: TextEntryHooks;

  constructor(hooks: TextEntryHooks) {
    this.hooks = hooks;
  }

  /**
   * Insert text the way `Input.insertText` does: **no key events at all**, but `beforeinput` and
   * `input` still fire. Components that filter `keydown` accept this where synthetic keystrokes
   * are silently dropped.
   *
   * Deliberately a fallback, never the default: it is not a humanlike path.
   */
  async insertText(webContents: WebContents, text: string): Promise<boolean> {
    if (webContents && !webContents.isDestroyed()) {
      try {
        webContents.focus();
      } catch {}
    }
    const ok = await this.hooks.cdp.send(webContents, 'Input.insertText', { text });
    if (ok) this.hooks.onTransport('cdp');
    return ok;
  }

  /**
   * Paste `text` into the focused control through the real clipboard. The previous clipboard
   * contents are restored so a probe never eats what the human had copied.
   */
  async pasteText(webContents: WebContents, text: string): Promise<boolean> {
    if (!webContents || webContents.isDestroyed()) return false;
    let previous = '';
    try {
      // Electron 44 exposes the clipboard asynchronously.
      previous = await clipboard.readText();
    } catch {}
    try {
      await clipboard.writeText(text);
      webContents.focus();
      webContents.paste();
      // Give the renderer a beat to apply the paste before the clipboard is restored.
      await new Promise((resolve) => setTimeout(resolve, 120));
      this.hooks.onTransport('native');
      return true;
    } catch {
      return false;
    } finally {
      try {
        await clipboard.writeText(previous);
      } catch {}
    }
  }

  /** When to use: typing into an already-focused control at the profile's WPM. */
  async typeText(webContents: WebContents, text: string, options?: { baseSpeedWpm?: number }): Promise<void> {
    this.hooks.cdp.ensureTarget(webContents);
    bump('action.type');
    for (let i = 0; i < text.length; i++) {
      if (this.hooks.isHumanActive()) {
        throw new Error('HUMAN_IN_PROGRESS: the human is using the browser — synthetic typing is paused.');
      }
      this.hooks.markSynthetic();
      const char = text[i];
      const d = keyDescriptor(char);

      const viaCdp = await this.hooks.cdp.send(webContents, 'Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: d.key,
        code: d.code,
        windowsVirtualKeyCode: d.vk,
        nativeVirtualKeyCode: d.vk,
        text: char,
        unmodifiedText: char,
      });
      if (viaCdp) {
        this.hooks.onTransport('cdp');
      } else {
        this.hooks.onTransport('native');
        // Send keyDown
        webContents.sendInputEvent({
          type: 'keyDown',
          keyCode: char,
        });

        // Send char input
        webContents.sendInputEvent({
          type: 'char',
          keyCode: char,
        });
      }

      await this.hooks.cdp.send(webContents, 'Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: d.key,
        code: d.code,
        windowsVirtualKeyCode: d.vk,
        nativeVirtualKeyCode: d.vk,
      });
      if (!viaCdp) {
        // Send keyUp
        webContents.sendInputEvent({
          type: 'keyUp',
          keyCode: char,
        });
      }

      // Variable inter-key latency derived from the typing WPM setting (12000 / wpm ms per
      // character), with extra deliberation on spaces and punctuation. 220 wpm ≈ 55ms/char.
      const base = 12000 / Math.max(40, this.hooks.typingWpm());
      let delay = base * (0.72 + Math.random() * 0.56);
      if (char === ' ') {
        delay *= 1.35 + Math.random() * 0.5;
      } else if (['.', ',', '!', '?', ';'].includes(char)) {
        delay *= 1.6 + Math.random() * 0.9;
      }

      this.hooks.reporter?.onKey?.(char, delay);
      await sleep(delay);
    }
  }

  /** When to use: pressing an individual key (e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown'). */
  async pressKey(webContents: WebContents, key: string): Promise<void> {
    this.hooks.cdp.ensureTarget(webContents);
    // `Shift+Tab` (and any other Shift-modified named key) is a real keyboard gesture; keep the
    // modifier on the CDP event, otherwise Chromium performs a forward Tab instead.
    const shiftMatch = /^Shift\+(.+)$/i.exec(key);
    const baseKey = shiftMatch ? shiftMatch[1] : key;
    const modifiers = shiftMatch ? 8 : 0; // CDP: Alt=1, Ctrl=2, Meta=4, Shift=8
    const d = keyDescriptor(baseKey);
    // Enter/Space need their text payload for Chromium to run the default action (activate a
    // focused button, submit a form); a bare keyDown only updates focus/scroll state.
    const text = d.key === 'Enter' ? '\r' : d.key === ' ' ? ' ' : undefined;
    const downViaCdp = await this.hooks.cdp.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: d.key,
      code: d.code,
      windowsVirtualKeyCode: d.vk,
      nativeVirtualKeyCode: d.vk,
      modifiers,
      ...(text !== undefined ? { text, unmodifiedText: text } : {}),
    });
    this.hooks.onTransport(downViaCdp ? 'cdp' : 'native');
    if (!downViaCdp) {
      webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: baseKey,
        modifiers: shiftMatch ? ['shift'] : undefined,
      });
    }
    await sleep(40 + Math.random() * 30);
    await this.hooks.cdp.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: d.key,
      code: d.code,
      windowsVirtualKeyCode: d.vk,
      nativeVirtualKeyCode: d.vk,
      modifiers,
    });
    if (!downViaCdp) {
      webContents.sendInputEvent({
        type: 'keyUp',
        keyCode: baseKey,
        modifiers: shiftMatch ? ['shift'] : undefined,
      });
    }
    this.hooks.reporter?.onKey?.(key, 50);
  }

  /**
   * Clears the *focused* field with a trusted select-all + delete (Ctrl+A, Backspace).
   *
   * Deliberately keyboard-driven rather than writing `el.value = ''`: a real keystroke fires a
   * genuine `input` event and never sets `isTrusted: false`.
   */
  async clearFocusedField(webContents: WebContents): Promise<void> {
    this.hooks.cdp.ensureTarget(webContents);
    const downViaCdp = await this.hooks.cdp.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2, // Ctrl
    });
    this.hooks.onTransport(downViaCdp ? 'cdp' : 'native');
    if (!downViaCdp) {
      webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
    }
    await sleep(30 + Math.random() * 30);
    await this.hooks.cdp.send(webContents, 'Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'a',
      code: 'KeyA',
      windowsVirtualKeyCode: 65,
      nativeVirtualKeyCode: 65,
      modifiers: 2,
    });
    if (!downViaCdp) {
      webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
    }
    await this.pressKey(webContents, 'Backspace');
  }
}
