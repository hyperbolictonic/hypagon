/**
 * Encrypted, host-bound credentials for Kuang Wrap.
 *
 * The MCP process only ever holds a *secret name*. Values are entered through
 * Settings, encrypted by Electron's OS-backed `safeStorage`, and resolved in
 * main at request time. A secret is useless unless the request host matches one
 * of its human-authored `allowedHosts`.
 *
 * The cipher is injected so this module stays testable without Electron.
 *
 * Why this file is small: `secret-types.ts` declares the shapes, `secret-rules.ts`
 * owns what a credential may contain, `secret-file.ts` owns the document and
 * `secret-tokens.ts` owns the OAuth2 cache and mint. This class lists, saves,
 * deletes and resolves.
 */

import { SecretFileStore } from './secret-file.ts';
import { OAuthTokens } from './secret-tokens.ts';
import { hostAllowed, metadataOf, planOAuth, planSecret } from './secret-rules.ts';
import type {
  SecretCipher,
  SecretRecord,
  SecretResolution,
  SecretStoreOptions,
  WrapSecretInput,
  WrapSecretMetadata,
} from './secret-types.ts';

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
} from './secret-types.ts';

/** When to use: Settings → Secrets and the executor's resolve — list, save, delete and host-check encrypted credentials. */
export class SecretStore {
  readonly dir: string;
  private readonly cipher: SecretCipher;
  private readonly files: SecretFileStore;
  private readonly tokens: OAuthTokens;

  constructor(dir: string, cipher: SecretCipher, options: SecretStoreOptions = {}) {
    this.dir = dir;
    this.cipher = cipher;
    this.files = new SecretFileStore(dir);
    this.tokens = new OAuthTokens(cipher, this.files, options);
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
    return this.files.read().secrets.length;
  }

  list(): WrapSecretMetadata[] {
    return this.files.read()
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

    const file = this.files.read();
    const rawName = typeof input?.name === 'string' ? input.name.trim() : '';
    const existing = file.secrets.find((secret) => secret.name === rawName);
    const plan = planSecret(input, Boolean(existing));
    const oauthPlan = planOAuth(input);
    const errors = [...plan.errors, ...oauthPlan.errors];
    if (errors.length > 0) return { ok: false, errors };

    let ciphertext: string;
    if (plan.keepExisting && existing) {
      ciphertext = existing.ciphertext;
    } else {
      try {
        ciphertext = this.cipher.encrypt(typeof input?.value === 'string' ? input.value : '');
      } catch (err: any) {
        return { ok: false, errors: [`Could not encrypt the secret: ${err?.message || err}`] };
      }
    }

    const now = new Date().toISOString();
    // Keep a cached OAuth2 token only when the token endpoint and client id are unchanged.
    const sameOAuth =
      existing?.kind === 'oauth2' &&
      existing.oauth2?.tokenUrl === oauthPlan.oauth2?.tokenUrl &&
      existing.oauth2?.clientId === oauthPlan.oauth2?.clientId;

    const record: SecretRecord = {
      name: plan.name,
      allowedHosts: plan.hosts,
      header: plan.header,
      prefix: plan.prefix,
      kind: oauthPlan.oauth2 ? 'oauth2' : 'static',
      ...(oauthPlan.oauth2 ? { oauth2: oauthPlan.oauth2 } : {}),
      ciphertext,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (record.kind === 'oauth2' && sameOAuth && existing?.tokenCiphertext) {
      record.tokenCiphertext = existing.tokenCiphertext;
      if (existing.oauth2?.tokenExpiresAt) {
        record.oauth2 = { ...(record.oauth2 as NonNullable<SecretRecord['oauth2']>), tokenExpiresAt: existing.oauth2.tokenExpiresAt };
      }
    }

    const secrets = existing
      ? file.secrets.map((secret) => (secret.name === plan.name ? record : secret))
      : [...file.secrets, record].sort((a, b) => a.name.localeCompare(b.name));

    try {
      this.files.write({ schemaVersion: 1, secrets });
    } catch (err: any) {
      return { ok: false, errors: [`Could not save the secret: ${err?.message || err}`] };
    }

    return { ok: true, secret: metadataOf(record), errors: [] };
  }

  delete(name: string): boolean {
    const file = this.files.read();
    const next = file.secrets.filter((secret) => secret.name !== name);
    if (next.length === file.secrets.length) return false;
    try {
      this.files.write({ schemaVersion: 1, secrets: next });
      return true;
    } catch {
      return false;
    }
  }

  async resolve(name: string, host: string, options: { forceRefresh?: boolean } = {}): Promise<SecretResolution> {
    const record = this.files.read().secrets.find((secret) => secret.name === name);
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

    if (record.kind === 'oauth2') return await this.tokens.resolve(record, options);

    try {
      const value = this.cipher.decrypt(record.ciphertext);
      return { ok: true, header: record.header, value: `${record.prefix}${value}` };
    } catch (err: any) {
      return { ok: false, code: 'SECRET_DECRYPT_FAILED', message: `Could not decrypt secret "${name}": ${err?.message || err}` };
    }
  }
}
