/**
 * OAuth2 client-credentials for a Wrap secret: the cached token, the mint, and the
 * policy-checked default request to the human-authored token URL.
 *
 * Why a module: the cache window, the early-refresh rule and the mint failure codes
 * are one concern. The store resolves a credential; this decides whether it needs a
 * token first.
 *
 * The client secret and the resulting access token never leave main.
 */
import { assertSafeUrl } from './security.ts';
import type { SecretFileStore } from './secret-file.ts';
import type {
  SecretCipher,
  SecretRecord,
  SecretResolution,
  SecretStoreOptions,
  TokenRequest,
  TokenResult,
} from './secret-types.ts';

/**
 * Default token minter: a policy-checked POST to the human-authored token URL with the
 * `client_credentials` grant. The client secret and the resulting token never leave main.
 */
async function defaultMintToken(input: TokenRequest): Promise<TokenResult> {
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

/** When to use: `SecretStore.resolve` on a kind=oauth2 credential. */
export class OAuthTokens {
  private readonly cipher: SecretCipher;
  private readonly files: SecretFileStore;
  private readonly options: SecretStoreOptions;

  constructor(cipher: SecretCipher, files: SecretFileStore, options: SecretStoreOptions) {
    this.cipher = cipher;
    this.files = files;
    this.options = options;
  }

  /** Mint or reuse a client-credentials token. Cached until ~60s before expiry. */
  async resolve(record: SecretRecord, options: { forceRefresh?: boolean }): Promise<SecretResolution> {
    const oauth = record.oauth2;
    if (!oauth) {
      return { ok: false, code: 'SECRET_INVALID', message: `Credential "${record.name}" is OAuth2 but has no token URL.` };
    }

    const now = this.options.now ? this.options.now() : Date.now();
    const cached = this.cached(record, now, Boolean(options.forceRefresh));
    if (cached) {
      return { ok: true, header: record.header, value: `${record.prefix}${cached}`, refreshable: true };
    }

    let clientSecret: string;
    try {
      clientSecret = this.cipher.decrypt(record.ciphertext);
    } catch (err: any) {
      return { ok: false, code: 'SECRET_DECRYPT_FAILED', message: `Could not decrypt secret "${record.name}": ${err?.message || err}` };
    }

    const mint = this.options.mintToken ?? defaultMintToken;
    let token: TokenResult;
    try {
      token = await mint({
        tokenUrl: oauth.tokenUrl,
        clientId: oauth.clientId,
        clientSecret,
        scope: oauth.scope,
        audience: oauth.audience,
      });
    } catch (err: any) {
      return {
        ok: false,
        code: 'TOKEN_REQUEST_FAILED',
        message: `Could not obtain an OAuth2 token for "${record.name}": ${err?.message || err}`,
        refreshable: true,
      };
    }

    const expiresAt = new Date(now + Math.max(1, token.expiresIn) * 1000).toISOString();
    this.cache(record.name, token.accessToken, expiresAt);
    return { ok: true, header: record.header, value: `${record.prefix}${token.accessToken}`, refreshable: true };
  }

  private cached(record: SecretRecord, now: number, force: boolean): string | null {
    if (force || !record.tokenCiphertext) return null;
    const expiresAt = record.oauth2?.tokenExpiresAt ? Date.parse(record.oauth2.tokenExpiresAt) : 0;
    // Refresh 60s early so a token cannot expire mid-request.
    if (!Number.isFinite(expiresAt) || expiresAt - now < 60_000) return null;
    try {
      return this.cipher.decrypt(record.tokenCiphertext);
    } catch {
      return null;
    }
  }

  private cache(name: string, accessToken: string, expiresAt: string): void {
    try {
      const file = this.files.read();
      const next = file.secrets.map((secret) => {
        if (secret.name !== name || !secret.oauth2) return secret;
        return {
          ...secret,
          tokenCiphertext: this.cipher.encrypt(accessToken),
          oauth2: { ...secret.oauth2, tokenExpiresAt: expiresAt },
        };
      });
      this.files.write({ schemaVersion: 1, secrets: next });
    } catch {
      // A cache write failure only costs a re-mint next time.
    }
  }
}
