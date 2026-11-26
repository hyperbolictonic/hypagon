/**
 * The keyboard: humanized typing, the two fallback channels (`Input.insertText` and
 * a real clipboard paste), a single named key, and the trusted select-all clear.
 *
 * Typing has a cadence, a transport choice and two fallbacks, and the clear gesture
 * is a modified key pair. They share the key tables and the CDP transport — nothing
 * else.
 */
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';
import type { CdpInput } from './cdp-input.ts';
import type { InputState } from './context.ts';
import { keyDescriptor, keyEventParams } from './keys.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** When to use: `HumanizedInput` — everything that presses keys. */
export class HumanKeyboard {
  private readonly state: InputState;
  private readonly cdp: CdpInput;

  constructor(state: InputState, cdp: CdpInput) {
    this.state = state;
    this.cdp = cdp;
  }

  /** Types text with humanized cadence, realistic inter-key variance, and word pauses. */
  async typeText(target: BrowserTarget, text: string, options?: { baseSpeedWpm?: number }): Promise<void> {
    this.cdp.ensureTarget(target);
    this.state.metrics?.type?.();
    void options;
    for (let i = 0; i < text.length; i++) {
      if (this.state.humanGate?.()) {
        throw new Error('HUMAN_IN_PROGRESS: the human is using the browser — synthetic typing is paused.');
      }
      this.state.syntheticMarker?.(Date.now());
      const char = text[i];
      const d = keyDescriptor(char);

      const viaCdp = await this.cdp.send(target, 'Input.dispatchKeyEvent', {
        ...keyEventParams(d, 'down'),
        text: char,
        unmodifiedText: char,
      });
      if (viaCdp) {
        this.state.lastInputTransport = 'cdp';
      } else {
        this.state.lastInputTransport = 'native';
        this.state.native?.key?.(target, 'down', char);
        this.state.native?.key?.(target, 'char', char);
      }

      await this.cdp.send(target, 'Input.dispatchKeyEvent', keyEventParams(d, 'up'));
      if (!viaCdp) this.state.native?.key?.(target, 'up', char);

      // Variable inter-key latency derived from the typing WPM setting (12000 / wpm ms per
      // character), with extra deliberation on spaces and punctuation. 220 wpm ≈ 55ms/char.
      const base = 12000 / Math.max(40, this.state.profile.typingWpm);
      let delay = base * (0.72 + Math.random() * 0.56);
      if (char === ' ') {
        delay *= 1.35 + Math.random() * 0.5;
      } else if (['.', ',', '!', '?', ';'].includes(char)) {
        delay *= 1.6 + Math.random() * 0.9;
      }

      this.state.reporter?.onKey?.(char, delay);
      await sleep(delay);
    }
  }

  /**
   * Insert text the way `Input.insertText` does: **no key events at all**, but `beforeinput`
   * and `input` still fire. Components that filter `keydown` (a common pattern in
   * web-component text fields) accept this where synthetic keystrokes are silently dropped.
   *
   * Deliberately a fallback, never the default: it is not a humanlike path (no per-key
   * timing, no keydown), so it should only run after real typing has been *proved* to have
   * had no effect.
   */
  async insertText(target: BrowserTarget, text: string): Promise<boolean> {
    this.state.native?.focus?.(target);
    const ok = await this.cdp.send(target, 'Input.insertText', { text });
    if (ok) this.state.lastInputTransport = 'cdp';
    return ok;
  }

  /**
   * Paste `text` into the focused control through the real clipboard (trusted paste, which
   * most controls accept as normal user behaviour). The previous clipboard contents are
   * restored so a probe never eats what the human had copied.
   */
  async pasteText(target: BrowserTarget, text: string): Promise<boolean> {
    let previous = '';
    try {
      previous = (await this.state.clipboard?.readText?.()) ?? '';
    } catch {
      // No clipboard access: the paste below will simply fail.
    }
    try {
      await this.state.clipboard?.writeText?.(text);
      this.state.native?.focus?.(target);
      this.state.native?.paste?.(target);
      // Give the renderer a beat to apply the paste before the clipboard is restored.
      await sleep(120);
      this.state.lastInputTransport = 'native';
      return true;
    } catch {
      return false;
    } finally {
      try {
        await this.state.clipboard?.writeText?.(previous);
      } catch {
        // Restoring the clipboard is best-effort.
      }
    }
  }

  /** Presses an individual key (e.g. 'Enter', 'Tab', 'Escape', 'ArrowDown'). */
  async pressKey(target: BrowserTarget, key: string): Promise<void> {
    this.cdp.ensureTarget(target);
    // `Shift+Tab` (and any other Shift-modified named key) is a real keyboard gesture; keep the
    // modifier on the CDP event, otherwise Chromium performs a forward Tab instead.
    const shiftMatch = /^Shift\+(.+)$/i.exec(key);
    const baseKey = shiftMatch ? shiftMatch[1] : key;
    const modifiers = shiftMatch ? 8 : 0; // CDP: Alt=1, Ctrl=2, Meta=4, Shift=8
    const d = keyDescriptor(baseKey);
    // Enter/Space need their text payload for Chromium to run the default action (activate a
    // focused button, submit a form); a bare keyDown only updates focus/scroll state.
    const text = d.key === 'Enter' ? '\r' : d.key === ' ' ? ' ' : undefined;
    const downViaCdp = await this.cdp.send(
      target,
      'Input.dispatchKeyEvent',
      keyEventParams(d, 'down', { modifiers, ...(text !== undefined ? { text, unmodifiedText: text } : {}) }),
    );
    this.state.lastInputTransport = downViaCdp ? 'cdp' : 'native';
    if (!downViaCdp) {
      this.state.native?.key?.(target, 'down', baseKey, shiftMatch ? ['shift'] : undefined);
    }
    await sleep(40 + Math.random() * 30);
    await this.cdp.send(target, 'Input.dispatchKeyEvent', keyEventParams(d, 'up', { modifiers }));
    if (!downViaCdp) {
      this.state.native?.key?.(target, 'up', baseKey, shiftMatch ? ['shift'] : undefined);
    }
    this.state.reporter?.onKey?.(key, 50);
  }

  /**
   * Clears the *focused* field with a trusted select-all + delete (Ctrl+A, Backspace).
   *
   * Deliberately keyboard-driven rather than writing `el.value = ''`: a real keystroke fires a
   * genuine `input` event (so React/Vue controlled inputs actually update) and never sets
   * `isTrusted: false`, which is what trips behavioural bot sensors.
   */
  async clearFocusedField(target: BrowserTarget): Promise<void> {
    this.cdp.ensureTarget(target);
    const downViaCdp = await this.cdp.send(
      target,
      'Input.dispatchKeyEvent',
      keyEventParams({ key: 'a', code: 'KeyA', vk: 65 }, 'down', { type: 'rawKeyDown', modifiers: 2 }),
    );
    this.state.lastInputTransport = downViaCdp ? 'cdp' : 'native';
    if (!downViaCdp) {
      this.state.native?.key?.(target, 'down', 'A', ['control']);
    }
    await sleep(30 + Math.random() * 30);
    await this.cdp.send(target, 'Input.dispatchKeyEvent', keyEventParams({ key: 'a', code: 'KeyA', vk: 65 }, 'up', { modifiers: 2 }));
    if (!downViaCdp) {
      this.state.native?.key?.(target, 'up', 'A', ['control']);
    }
    await this.pressKey(target, 'Backspace');
  }
}
