/**
 * The US-layout key tables: what CDP must see for one typed character or named
 * key.
 *
 * Why a module: the tables are data carrying hard-won detail (see the virtual-key
 * note); the keyboard controller only looks things up.
 */

/** Named (non-printable) keys, mapped to their CDP `key`/`code`/virtual-keycode. */
const NAMED_KEYS: Record<string, { key: string; code: string; vk: number }> = {
  Enter: { key: 'Enter', code: 'Enter', vk: 13 },
  Tab: { key: 'Tab', code: 'Tab', vk: 9 },
  Escape: { key: 'Escape', code: 'Escape', vk: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', vk: 8 },
  Delete: { key: 'Delete', code: 'Delete', vk: 46 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', vk: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', vk: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', vk: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', vk: 39 },
  Home: { key: 'Home', code: 'Home', vk: 36 },
  End: { key: 'End', code: 'End', vk: 35 },
  PageUp: { key: 'PageUp', code: 'PageUp', vk: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', vk: 34 },
  Space: { key: ' ', code: 'Space', vk: 32 },
};

/**
 * Printable punctuation → US-layout `code` name **and Windows virtual-key code**.
 *
 * `vk` must be the virtual-key code, never the ASCII value: ASCII collides with real VKs, and
 * Chromium honours those as editing/navigation commands instead of inserting the character —
 * `'.'` is ASCII 46 = `VK_DELETE` and `"'"` is ASCII 39 = `VK_RIGHT`, so both were silently
 * swallowed (typing `gmail.com` produced `gmailcom`, and any password containing `'` was
 * corrupted). Shifted variants share the physical key's VK; the character itself is carried by
 * the event's `text`, so no shift modifier is needed.
 */
const PUNCT: Record<string, { code: string; vk: number }> = {
  ' ': { code: 'Space', vk: 32 },
  ';': { code: 'Semicolon', vk: 186 }, ':': { code: 'Semicolon', vk: 186 },
  '=': { code: 'Equal', vk: 187 }, '+': { code: 'Equal', vk: 187 },
  ',': { code: 'Comma', vk: 188 }, '<': { code: 'Comma', vk: 188 },
  '-': { code: 'Minus', vk: 189 }, '_': { code: 'Minus', vk: 189 },
  '.': { code: 'Period', vk: 190 }, '>': { code: 'Period', vk: 190 },
  '/': { code: 'Slash', vk: 191 }, '?': { code: 'Slash', vk: 191 },
  '`': { code: 'Backquote', vk: 192 }, '~': { code: 'Backquote', vk: 192 },
  '[': { code: 'BracketLeft', vk: 219 }, '{': { code: 'BracketLeft', vk: 219 },
  '\\': { code: 'Backslash', vk: 220 }, '|': { code: 'Backslash', vk: 220 },
  ']': { code: 'BracketRight', vk: 221 }, '}': { code: 'BracketRight', vk: 221 },
  "'": { code: 'Quote', vk: 222 }, '"': { code: 'Quote', vk: 222 },
  '!': { code: 'Digit1', vk: 49 }, '@': { code: 'Digit2', vk: 50 },
  '#': { code: 'Digit3', vk: 51 }, '$': { code: 'Digit4', vk: 52 },
  '%': { code: 'Digit5', vk: 53 }, '^': { code: 'Digit6', vk: 54 },
  '&': { code: 'Digit7', vk: 55 }, '*': { code: 'Digit8', vk: 56 },
  '(': { code: 'Digit9', vk: 57 }, ')': { code: 'Digit0', vk: 48 },
};

/** Best-effort US-layout descriptor for a single typed character. */
export function keyDescriptor(ch: string): { key: string; code: string; vk: number } {
  if (NAMED_KEYS[ch]) return NAMED_KEYS[ch];
  const lower = ch.toLowerCase();
  if (lower >= 'a' && lower <= 'z') {
    return { key: ch, code: `Key${lower.toUpperCase()}`, vk: lower.toUpperCase().charCodeAt(0) };
  }
  if (ch >= '0' && ch <= '9') return { key: ch, code: `Digit${ch}`, vk: ch.charCodeAt(0) };
  const punct = PUNCT[ch];
  if (punct) return { key: ch, code: punct.code, vk: punct.vk };
  return { key: ch, code: '', vk: 0 };
}

/** The CDP `Input.dispatchKeyEvent` payload for a descriptor; `phase` picks down or up. */
export function keyEventParams(
  d: { key: string; code: string; vk: number },
  phase: 'down' | 'up',
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: phase === 'down' ? 'keyDown' : 'keyUp',
    key: d.key,
    code: d.code,
    windowsVirtualKeyCode: d.vk,
    nativeVirtualKeyCode: d.vk,
    ...extra,
  };
}
