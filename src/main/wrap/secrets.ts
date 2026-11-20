/**
 * Encrypted, host-bound credentials for Kuang Wrap.
 *
 * The MCP process only ever holds a *secret name*. Values are entered through
 * Settings, encrypted by Electron's OS-backed `safeStorage`, and resolved in
 * main at request time. A secret is useless unless the request host matches one
 * of its human-authored `allowedHosts`.
 *
 * The cipher is injected so this module stays testable without Electron.
 */


import { metadataOf, readSecretsFile, secretsFilePath, writeSecretsFile } from './secret-storage.js';
import { hostAllowed, validateSecretInput } from './secret-validation.js';
import { defaultMintToken } from './oauth-mint.js';
import type {
  SecretCipher,
  SecretFile,
  SecretRecord,
  SecretResolution,
  SecretStoreOptions,
  TokenMinter,
  TokenRequest,
  TokenResult,
  WrapOAuthMetadata,
  WrapSecretInput,
  WrapSecretKind,
  WrapSecretMetadata,
} from './secret-types.js';

export type {
  SecretCipher,
  SecretResolution,
  SecretStoreOptions,
  TokenMinter,
  TokenRequest,
  TokenResult,
  WrapOAuthMetadata,
  WrapSecretInput,
  WrapSecretKind,
  WrapSecretMetadata,
} from './secret-types.js';

/** When to use: storing or resolving wrapper credentials; values never leave the store unredacted. */
export class SecretStore {
  readonly dir: string;
  private readonly cipher: SecretCipher;
  private readonly options: SecretStoreOptions;

  constructor(dir: string, cipher: SecretCipher, options: SecretStoreOptions = {}) {
    this.dir = dir;
    this.cipher = cipher;
    this.options = options;
  }

  available(): boolean {
    try {
      return this.cipher.available();
    } catch {
      return false;
    }
  }

  warning(): string {
    return this.cipher.warning || '';
  }

  count(): number {
    return this.readFile().secrets.length;
  }

  list(): WrapSecretMetadata[] {
    return this.readFile()
      .secrets.map((secret) => metadataOf(secret))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  set(input: WrapSecretInput): { ok: boolean; secret?: WrapSecretMetadata; errors: string[] } {
    if (!this.available()) {
      return {
        ok: false,
        errors: [
          this.warning() ||
            'OS-backed encryption is unavailable, so secrets are disabled. On Linux, install a keyring and restart.',
        ],
      };
    }

    const file = this.readFile();
    const inputName = typeof input?.name === 'string' ? input.name.trim() : '';
    const existing = file.secrets.find((secret) => secret.name === inputName);
    const validation = validateSecretInput(input, Boolean(existing));
    if (!validation.ok) return { ok: false, errors: validation.errors };
    const { name, value, hosts, header, prefix, kind, oauth2, keepExisting } = validation.value;

    let ciphertext: string;
    if (keepExisting && existing) {
      ciphertext = existing.ciphertext;
    } else {
      try {
        ciphertext = this.cipher.encrypt(value);
      } catch (err: any) {
        return { ok: false, errors: [`Could not encrypt the secret: ${err?.message || err}`] };
      }
    }

    const now = new Date().toISOString();
    // Keep a cached OAuth2 token only when the token endpoint and client id are unchanged.
    const sameOAuth =
      existing?.kind === 'oauth2' &&
      existing.oauth2?.tokenUrl === oauth2?.tokenUrl &&
      existing.oauth2?.clientId === oauth2?.clientId;

    const record: SecretRecord = {
      name,
      allowedHosts: hosts,
      header,
      prefix,
      kind,
      ...(oauth2 ? { oauth2 } : {}),
      ciphertext,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (kind === 'oauth2' && sameOAuth && existing?.tokenCiphertext) {
      record.tokenCiphertext = existing.tokenCiphertext;
      if (existing.oauth2?.tokenExpiresAt) {
        record.oauth2 = { ...(record.oauth2 as WrapOAuthMetadata), tokenExpiresAt: existing.oauth2.tokenExpiresAt };
      }
    }

    const secrets = existing
      ? file.secrets.map((secret) => (secret.name === name ? record : secret))
      : [...file.secrets, record].sort((a, b) => a.name.localeCompare(b.name));

    try {
      this.writeFile({ schemaVersion: 1, secrets });
    } catch (err: any) {
      return { ok: false, errors: [`Could not save the secret: ${err?.message || err}`] };
    }

    return { ok: true, secret: metadataOf(record), errors: [] };
  }

  delete(name: string): boolean {
    const file = this.readFile();
    const next = file.secrets.filter((secret) => secret.name !== name);
    if (next.length === file.secrets.length) return false;
    try {
      this.writeFile({ schemaVersion: 1, secrets: next });
      return true;
    } catch {
      return false;
    }
  }

  async resolve(
    name: string,
    host: string,
    options: { forceRefresh?: boolean } = {},
  ): Promise<SecretResolution> {
    const record = this.readFile().secrets.find((secret) => secret.name === name);
    if (!record) {
      return { ok: false, code: 'SECRET_NOT_FOUND', message: `No secret named "${name}". Ask a human to add it in Settings → Wrappers.` };
    }

    if (!this.available()) {
      return {
        ok: false,
        code: 'SECRETS_UNAVAILABLE',
        message: this.warning() || 'OS-backed encryption is unavailable, so the secret cannot be decrypted.',
      };
    }

    if (!hostAllowed(record.allowedHosts, host)) {
      return {
        ok: false,
        code: 'SECRET_HOST_MISMATCH',
        message: `Secret "${name}" is not bound to ${host}. Only a human can change the allowed hosts.`,
      };
    }

    if (record.kind === 'oauth2') return await this.resolveOAuth(record, options);

    try {
      const value = this.cipher.decrypt(record.ciphertext);
      return { ok: true, header: record.header, value: `${record.prefix}${value}` };
    } catch (err: any) {
      return { ok: false, code: 'SECRET_DECRYPT_FAILED', message: `Could not decrypt secret "${name}": ${err?.message || err}` };
    }
  }

  /** Mint or reuse a client-credentials token. Cached until ~60s before expiry. */
  private async resolveOAuth(record: SecretRecord, options: { forceRefresh?: boolean }): Promise<SecretResolution> {
    const oauth = record.oauth2;
    if (!oauth) {
      return { ok: false, code: 'SECRET_INVALID', message: `Credential "${record.name}" is OAuth2 but has no token URL.` };
    }

    const now = this.options.now ? this.options.now() : Date.now();
    const cached = this.cachedToken(record, now, Boolean(options.forceRefresh));
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
    this.cacheToken(record.name, token.accessToken, expiresAt);
    return { ok: true, header: record.header, value: `${record.prefix}${token.accessToken}`, refreshable: true };
  }

  private cachedToken(record: SecretRecord, now: number, force: boolean): string | null {
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

  private cacheToken(name: string, accessToken: string, expiresAt: string): void {
    try {
      const file = this.readFile();
      const next = file.secrets.map((secret) => {
        if (secret.name !== name || !secret.oauth2) return secret;
        return {
          ...secret,
          tokenCiphertext: this.cipher.encrypt(accessToken),
          oauth2: { ...secret.oauth2, tokenExpiresAt: expiresAt },
        };
      });
      this.writeFile({ schemaVersion: 1, secrets: next });
    } catch {
      // A cache write failure only costs a re-mint next time.
    }
  }

  private filePath(): string {
    return secretsFilePath(this.dir);
  }

  private readFile(): SecretFile {
    return readSecretsFile(this.filePath());
  }

  private writeFile(file: SecretFile): void {
    writeSecretsFile(this.dir, this.filePath(), file);
  }
}
