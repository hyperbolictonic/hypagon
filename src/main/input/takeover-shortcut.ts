/**
 * The human-takeover chord: Ctrl/Cmd+Shift+Space (or Ctrl/Cmd+Shift+H).
 *
 * Two places listen for it — the shell window and every browsing tab — and both must
 * agree on the exact chord, or takeover would work in one place and not the other.
 *
 * When to use: a `before-input-event` handler that offers explicit human control.
 */
import type { Input } from 'electron';

/** When to use: deciding whether one key event is the takeover request. */
export function isHumanTakeoverShortcut(input: Input): boolean {
  if (input.type !== 'keyDown' || input.alt) return false;
  const mod = process.platform === 'darwin' ? input.meta : input.control;
  if (!mod) return false;
  return Boolean(
    input.shift &&
      (input.key === ' ' || input.key === 'Space' || input.code === 'Space' || input.key.toLowerCase() === 'h'),
  );
}
