/**
 * The credential shapes Kuang Wrap publishes: what a secret is, how it resolves, and
 * what the settings UI may show.
 *
 * Values themselves never appear in these shapes — only metadata and one resolution.
 *
 * When to use: typing a stored credential, an OAuth2 client, a resolution result, or
 * the injected cipher/minter. Behaviour lives in `wrap/secrets.ts`.
 */

/** When to use: injecting a different at-rest cipher in tests or a host with its own key store. */
export interface SecretCipher {
  available(): boolean;
  warning?: string;
  encrypt(value: string): string;
  decrypt(payload: string): string;
}

/** When to use: declaring whether a wrapper credential is a static value or an OAuth2 client. */
export type WrapSecretKind = 'static' | 'oauth2';

/** When to use: describing the token endpoint and client of an OAuth2 wrapper credential. */
export interface WrapOAuthMetadata {
  tokenUrl: string;
  clientId: string;
  scope?: string;
  audience?: string;
  /** When the cached access token expires (ISO). The token itself never leaves main. */
  tokenExpiresAt?: string;
}

/** When to use: listing stored credentials in Settings → Wrappers without exposing values. */
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

/** When to use: creating or updating a stored credential from the settings UI. */
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

/** When to use: reading a resolved credential just before a wrapped request is sent. */
export interface SecretResolution {
  ok: boolean;
  header?: string;
  value?: string;
  code?: string;
  message?: string;
  /** True when the credential is an OAuth2 token that can be re-minted. */
  refreshable?: boolean;
}

/** When to use: implementing a TokenMinter or minting an OAuth2 token for a wrapper. */
export interface TokenRequest {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
  audience?: string;
}

/** When to use: returning a minted token (or the failure) from a TokenMinter. */
export interface TokenResult {
  accessToken: string;
  /** Lifetime in seconds. */
  expiresIn: number;
  tokenType?: string;
}

/** When to use: supplying the OAuth2 token exchange used by an oauth2 wrapper credential. */
export type TokenMinter = (input: TokenRequest) => Promise<TokenResult>;

/** When to use: constructing an isolated SecretStore (custom file, cipher) in tests. */
export interface SecretStoreOptions {
  /** Injected for tests; defaults to a policy-checked POST to the token URL. */
  mintToken?: TokenMinter;
  /** Injected clock (ms) for token-expiry tests. */
  now?: () => number;
}

/** When to use: reading or writing the on-disk record; `ciphertext` is never exposed. */
export interface SecretRecord extends WrapSecretMetadata {
  /** Static value, or the OAuth2 client secret. */
  ciphertext: string;
  /** Cached OAuth2 access token (encrypted). */
  tokenCiphertext?: string;
}

/** When to use: reading or writing `secrets.json` (schema 1). */
export interface SecretFile {
  schemaVersion: 1;
  secrets: SecretRecord[];
}
