/**
 * The default OAuth2 token exchange (`client_credentials`).
 *
 * A policy-checked POST to the human-authored token URL. The client secret and the
 * resulting token never leave main; the store only keeps them encrypted.
 *
 * When to use: minting a wrapper credential's token when no `mintToken` was injected.
 */

import { assertSafeUrl } from './security.ts';
import type { TokenRequest, TokenResult } from './secret-types.js';

/** When to use: the store's default minter — a 15 s policy-checked client-credentials POST. */
export async function defaultMintToken(input: TokenRequest): Promise<TokenResult> {
  const url = await assertSafeUrl(input.tokenUrl, {
    allowHttp: false,
    allowPrivateHosts: process.env.KUANG_WRAP_ALLOW_PRIVATE === '1',
  });

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  if (input.scope) form.set('scope', input.scope);
  if (input.audience) form.set('audience', input.audience);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form,
      signal: controller.signal,
    });
    const text = await response.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (!response.ok || typeof json?.access_token !== 'string') {
      const detail = json?.error_description || json?.error || (text ? text.slice(0, 200) : '');
      throw new Error(`Token endpoint returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    const expiresIn = Number(json.expires_in);
    return {
      accessToken: json.access_token,
      expiresIn: Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600,
      tokenType: typeof json.token_type === 'string' ? json.token_type : undefined,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw new Error('Token request timed out after 15000 ms.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
