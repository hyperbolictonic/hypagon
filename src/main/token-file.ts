/**
 * Local capability-token files.
 *
 * Both the wrap bridge and the remote gateway hand a long-lived companion process
 * a *path* to a rotated token instead of the value, so a restart never invalidates
 * the MCP client's config. Writes are atomic and owner-only where the platform
 * supports it.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

/**
 * When to use: mint a fresh capability token at `target`, replacing any previous file atomically.
 * The caller owns the parent directory and decides how long the token lives.
 */
export function createTokenFile(target: string): string {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Windows uses ACLs; the userData directory is already user-private.
  }
  return token;
}

/**
 * When to use: validate a token file read by a companion process. A missing, unreadable,
 * malformed or empty file returns `undefined` so callers can fail closed.
 */
export function readTokenFile(target: string): string | undefined {
  try {
    const value = fs.readFileSync(target, 'utf8').trim();
    return TOKEN_PATTERN.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
