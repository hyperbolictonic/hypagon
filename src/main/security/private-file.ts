/**
 * Writing a file only its owner may read, without ever leaving a half-written one.
 *
 * Why a module: a capability token, a tunnel token and the Wrap credential document
 * all want the same three steps — private mode, temp file, rename — and getting any
 * of them wrong leaks a credential or truncates it on a crash. One implementation.
 */
import fs from 'node:fs';

/**
 * When to use: any file that holds a secret — a token, a client secret, a key.
 *
 * `ensureDir` creates the parent directory first (the caller owns it). The temp file is
 * renamed into place, so a reader sees either the old document or the new one.
 */
export function writePrivateFile(target: string, contents: string, options: { ensureDir?: string } = {}): void {
  if (options.ensureDir) fs.mkdirSync(options.ensureDir, { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, contents, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {
    // Windows uses ACLs; the userData directory is already user-private.
  }
}
