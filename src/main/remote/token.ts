/**
 * The remote-gateway capability token, backed by the shared implementation.
 * The caller owns the directory; the file is written atomically with
 * owner-only permissions.
 */
import { createCapabilityToken, readCapabilityToken, tokenPathIn } from '../security/capability-token.ts';

/** When to use: a surface that needs the token file path itself (the gateway status UI). */
export const remoteTokenFile = tokenPathIn;

/** When to use: first start or rotation — create the gateway token and return it. */
export const createRemoteToken = createCapabilityToken;

/** When to use: a bearer authorizer — read the gateway token from disk, or undefined when absent. */
export const readRemoteToken = readCapabilityToken;
