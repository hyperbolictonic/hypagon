/**
 * The wrap bridge token.
 *
 * The token is rotated on every app start and written to `<userData>/wrap/token`
 * with owner-only permissions. The MCP server is given the *path* through
 * `KUANG_WRAP_TOKEN_FILE`, not the value, so a long-lived MCP process keeps
 * working across app restarts without copying a new secret into its config.
 *
 * This is a local capability token, not an API credential. It protects the
 * bridge from unrelated local processes; it does not replace the human-only
 * secret store that arrives with S2.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createTokenFile, readTokenFile } from '../token-file.ts';

/** When to use: resolve the wrap bridge's capability-token path under its data directory. */
export function tokenFile(wrapDir: string): string {
  return path.join(wrapDir, 'token');
}

/** When to use: rotate the wrap-bridge token on app start so old processes lose access. */
export function createWrapToken(wrapDir: string): string {
  fs.mkdirSync(wrapDir, { recursive: true });
  return createTokenFile(tokenFile(wrapDir));
}

/** When to use: authenticate a wrap request against the token file on disk. */
export function readWrapToken(wrapDir: string): string | undefined {
  return readTokenFile(tokenFile(wrapDir));
}
