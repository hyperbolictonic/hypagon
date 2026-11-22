/**
 * Local capability tokens: create, rotate and read.
 *
 * One implementation for both consumers (the wrap bridge and the remote
 * gateway): a 32-byte hex token written atomically (temp file + rename) with
 * owner-only permissions, and a reader that accepts only well-formed tokens.
 * This is a local capability token protecting a local surface from unrelated
 * local processes — not an API credential.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

/** The token file path inside a capability directory. */
export function tokenPathIn(dir: string): string {
  return path.join(dir, 'token');
}

/** Create (or rotate) the token in `dir`. The caller owns the directory. */
export function createCapabilityToken(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  const target = tokenPathIn(dir);
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

/** Read and validate a token file. A missing, malformed or empty file returns undefined. */
export function readCapabilityToken(file: string): string | undefined {
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    return TOKEN_PATTERN.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
