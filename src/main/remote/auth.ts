/**
 * The remote gateway's credentials: the capability token and the OAuth client.
 *
 * Why a module: the token file, the OAuth client file and the auth mode are read
 * by the gateway child (as paths in its environment), rotated from Settings, and
 * reported in the status. One object owns all three so a rotation cannot leave
 * the mode and the file disagreeing.
 */
import fs from 'node:fs';
import { createCapabilityToken, readCapabilityToken } from '../security/capability-token.ts';
import { createOAuthClient, ensureOAuthClient, type OAuthClientCredentials } from './oauth-client.ts';

/** When to use: the service constructor — the paths it already resolved. */
export interface RemoteAuthDeps {
  dataDir: string;
  tokenPath: string;
  oauthClientPath: string;
  /** The persisted auth mode, from settings. */
  mode: 'bearer' | 'oauth';
  /** Persist the mode (the service owns the settings file). */
  onChanged: () => void;
}

/** When to use: `RemoteService` — one auth state per service. */
export class RemoteAuth {
  private readonly deps: RemoteAuthDeps;
  private current: 'bearer' | 'oauth';

  constructor(deps: RemoteAuthDeps) {
    this.deps = deps;
    this.current = deps.mode;
  }

  /** The capability token, created on first use. */
  ensure(): string {
    const existing = readCapabilityToken(this.deps.tokenPath);
    if (existing) return existing;
    fs.mkdirSync(this.deps.dataDir, { recursive: true });
    return createCapabilityToken(this.deps.dataDir);
  }

  token(): string {
    return this.ensure();
  }

  /** The OAuth client, created on first use. */
  oauthClient(): OAuthClientCredentials {
    return ensureOAuthClient(this.deps.oauthClientPath);
  }

  mode(): 'bearer' | 'oauth' {
    return this.current;
  }

  /** Switch modes, creating the client up front when OAuth is selected. */
  setMode(mode: 'bearer' | 'oauth'): void {
    this.current = mode === 'oauth' ? 'oauth' : 'bearer';
    if (this.current === 'oauth') this.oauthClient();
    this.deps.onChanged();
  }

  /** Replace the OAuth client secret; running clients must be restarted. */
  rotateClient(): void {
    createOAuthClient(this.deps.oauthClientPath);
  }

  /** Replace the bearer token; running clients must be restarted. */
  rotateToken(): void {
    createCapabilityToken(this.deps.dataDir);
  }
}
