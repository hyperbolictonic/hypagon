/**
 * Shared JSON settings file I/O.
 *
 * Every settings store in the app does the same two things: read a JSON file and
 * fail open to defaults, and replace it atomically (write a temp sibling, then
 * rename) so a crash mid-write cannot leave a half-JSON profile behind. The
 * sequence used to be copy-pasted into eight stores.
 *
 * When to use: a store persists a small JSON settings document; do not hand-roll
 * `readFileSync`/`renameSync` again.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * When to use: decoding a settings file; returns null when it is missing, unreadable
 * or not valid JSON (callers fall back to their defaults).
 */
export function readJsonFile(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * When to use: replacing a settings file atomically; returns the underlying error
 * message so each store can keep its own user-facing wording.
 */
export function writeJsonFileAtomic(file: string, value: unknown): { ok: true } | { ok: false; error: string } {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err?.message || err) };
  }
}
