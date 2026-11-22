/**
 * The human-takeover keyboard shortcut, defined once.
 *
 * The chassis window listener and the tab manager's per-document listener both
 * watch for Ctrl/Cmd+Shift+Space (or H); the key-combo rule previously lived in
 * two files and could drift.
 */
import type { Input } from 'electron';

/** When to use: a `before-input-event` handler that must fire the takeover toggle. */
export function isTakeoverShortcut(
  input: Input,
  platform: NodeJS.Platform,
): boolean {
  if (input.type !== 'keyDown' || input.alt) return false;
  const mod = platform === 'darwin' ? input.meta : input.control;
  if (!mod) return false;
  return Boolean(
    input.shift &&
      (input.key === ' ' || input.key === 'Space' || input.code === 'Space' || input.key.toLowerCase() === 'h'),
  );
}
