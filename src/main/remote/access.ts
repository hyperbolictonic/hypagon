/**
 * Turning remote access on and off: start/stop the gateway, switch auth modes,
 * rotate credentials and drop live sessions.
 *
 * Why a module: these five operations are the only ones that cross the gateway,
 * the credentials and the tunnel — restart the child, keep the tunnel honest,
 * report status. The controllers each own their own state; the rules that span
 * them live here.
 */
import type { RemoteStatus } from '../../shared/remote.js';
import type { RemoteAuth } from './auth.js';
import type { RemoteGateway } from './gateway-child.js';
import type { RemoteTunnel } from './tunnel.js';

/** When to use: the service constructor — the three controllers and a status reader. */
export interface RemoteAccessDeps {
  auth: () => RemoteAuth;
  gateway: () => RemoteGateway;
  tunnel: () => RemoteTunnel;
  /** The composed status, read after every transition. */
  status: () => RemoteStatus;
}

/** When to use: `RemoteService` — one access state per service. */
export class RemoteAccess {
  private enabled = false;

  constructor(private readonly deps: RemoteAccessDeps) {}

  /** Whether the operator asked for remote access (independent of the child's health). */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** Enable or disable the gateway; disabling also drops the tunnel first. */
  async setEnabled(enabled: boolean): Promise<RemoteStatus> {
    if (enabled) {
      this.enabled = true;
      try {
        await this.deps.gateway().start();
      } catch (error) {
        this.enabled = false;
        throw error;
      }
    } else {
      this.enabled = false;
      await this.deps.tunnel().stop();
      await this.deps.gateway().stop();
    }
    return this.deps.status();
  }

  /** Switch bearer/OAuth, restarting a running gateway so the child sees the change. */
  async setAuthMode(mode: 'bearer' | 'oauth'): Promise<RemoteStatus> {
    const auth = this.deps.auth();
    const next = mode === 'oauth' ? 'oauth' : 'bearer';
    if (next === auth.mode()) return this.deps.status();
    await this.restart(() => auth.setMode(next));
    return this.deps.status();
  }

  /** Replace the OAuth client secret, restarting a running gateway. */
  async rotateOAuthClient(): Promise<RemoteStatus> {
    await this.restart(() => this.deps.auth().rotateClient());
    return this.deps.status();
  }

  /** Replace the bearer token, restarting the gateway when it was requested. */
  async rotateToken(): Promise<RemoteStatus> {
    const wasEnabled = this.enabled;
    await this.deps.gateway().stop();
    this.deps.auth().rotateToken();
    this.deps.gateway().clearError();
    if (wasEnabled) {
      this.enabled = true;
      await this.deps.gateway().start();
    }
    return this.deps.status();
  }

  /** Drop every live session by cycling the gateway child. */
  async disconnectSessions(): Promise<RemoteStatus> {
    if (!this.enabled) return this.deps.status();
    await this.deps.gateway().stop();
    await this.deps.gateway().start();
    return this.deps.status();
  }

  /**
   * Stop the child, apply a credential change, restart it when it was running.
   * A failed restart leaves `enabled` false, as the old inline blocks did.
   */
  private async restart(apply: () => void): Promise<void> {
    const wasRunning = this.deps.gateway().running();
    if (wasRunning) await this.deps.gateway().stop();
    apply();
    if (!wasRunning) return;
    this.enabled = true;
    try {
      await this.deps.gateway().start();
    } catch (error) {
      this.enabled = false;
      throw error;
    }
  }
}
