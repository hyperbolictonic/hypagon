/**
 * The wrap bridge token.
 *
 * The token is rotated on every app start and written to `<userData>/wrap/token`
 * with owner-only permissions. The MCP server is given the *path* through
 * `HB_WRAP_TOKEN_FILE` (legacy `KUANG_WRAP_TOKEN_FILE`), not the value, so a
 * long-lived MCP process keeps working across app restarts without copying a
 * new secret into its config.
 *
 * Backed by the shared capability-token implementation.
 */

import { createCapabilityToken, readCapabilityToken, tokenPathIn } from '../security/capability-token.ts';

export const tokenFile = tokenPathIn;
export const createWrapToken = createCapabilityToken;

export function readWrapToken(wrapDir: string): string | undefined {
  return readCapabilityToken(tokenFile(wrapDir));
}
