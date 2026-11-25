/**
 * The shapes of a Kuang Wrap credential: what a human enters, what Settings lists,
 * what the request path resolves, and what is persisted (encrypted).
 *
 * Why a module: the store, the validation rules, the token cache and the bridge all
 * describe the same credential, and none of them should import `secrets.ts` just to
 * name it.
 */

/** When to use: a stored credential — a fixed header value, or OAuth2 client credentials. */
export type WrapSecretKind = 'static' | 'oauth2';

/** When to use: the OAuth2 half of a credential (the client secret is not part of it). */
export interface WrapOAuthMetadata {
  tokenUrl: string;
  clientId: string;
  scope?: string;
  audience?: string;
  /** When the cached access token expires (ISO). The token itself never leaves main. */
  tokenExpiresAt?: string;
}

/** When to use: the Settings list and the bridge's `/wrap/secrets` — metadata only, no value. */
export interface WrapSecretMetadata {
  name: string;
  allowedHosts: string[];
  header: string;
  prefix: string;
  createdAt: string;
  updatedAt: string;
  /** `static` (default) or `oauth2` client-credentials. */
  kind: WrapSecretKind;
  oauth2?: WrapOAuthMetadata;
}

/** When to use: `SecretStore.set` — what a human filled in. */
export interface WrapSecretInput {
  name: string;
  value: string;
  allowedHosts: string[] | string;
  header?: string;
  prefix?: string;
  kind?: WrapSecretKind;
  tokenUrl?: string;
  clientId?: string;
  scope?: string;
  audience?: string;
}

/** When to use: the app injects Electron's safeStorage implementation. */
export interface SecretCipher {
  available(): boolean;
  warning?: string;
  encrypt(value: string): string;
  decrypt(payload: string): string;
}

/** When to use: `SecretStore.resolve` — the header a request needs, or why it could not. */
export interface SecretResolution {
  ok: boolean;
  header?: string;
  value?: string;
  code?: string;
  message?: string;
  /** True when the credential is an OAuth2 token that can be re-minted. */
  refreshable?: boolean;
}

/** When to use: a client-credentials token request. */
export interface TokenRequest {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  audience?: string;
}

/** When to use: what a token endpoint answered. */
export interface TokenResult {
  accessToken: string;
  /** Lifetime in seconds. */
  expiresIn: number;
  tokenType?: string;
}

/** When to use: `SecretStoreOptions.mintToken` — a test or an alternate endpoint. */
export type TokenMinter = (input: TokenRequest) => Promise<TokenResult>;

/** When to use: `new SecretStore(dir, cipher, options)`. */
export interface SecretStoreOptions {
  /** Injected for tests; defaults to a policy-checked POST to the token URL. */
  mintToken?: TokenMinter;
  /** Injected clock (ms) for token-expiry tests. */
  now?: () => number;
}

/** When to use: the persisted record — the metadata plus the encrypted payloads. */
export interface SecretRecord extends WrapSecretMetadata {
  /** Static value, or the OAuth2 client secret. */
  ciphertext: string;
  /** Cached OAuth2 access token (encrypted). */
  tokenCiphertext?: string;
}

/** When to use: `SecretFileStore` — the on-disk document. */
export interface SecretFile {
  schemaVersion: 1;
  secrets: SecretRecord[];
}
