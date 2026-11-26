/**
 * The Cloudflare named tunnel in front of the gateway.
 *
 * Why a module: the tunnel state (running, hostname, token, last error) plus the
 * rules that guard it — a hostname must be a full DNS name, a token is written
 * atomically, and enabling requires the gateway to be up first — were eight
 * methods on the service. They are one object.
 */
import fs from 'node:fs';
import { writePrivateFile } from '../security/private-file.ts';
import { CloudflaredTunnel } from '../../../packages/cloudflared-tunnel/src/index.ts';
import type { RemoteTunnelStatus } from '../../shared/remote.js';

/** A hostname the tunnel can serve: full DNS name, lower case, no scheme. */
function normalizeHostname(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error('Public hostname is required.');
  let hostname: string;
  try {
    hostname = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
  } catch {
    throw new Error('Public hostname is not valid.');
  }
  hostname = hostname.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || !hostname.includes('.')) {
    throw new Error('Public hostname must be a full DNS name, for example mcp.example.com.');
  }
  return hostname;
}

/** When to use: the service constructor — the paths and the gateway it fronts. */
export interface RemoteTunnelDeps {
  dataDir: string;
  tokenPath: string;
  logFile: string;
  argsPrefix?: string[];
  hostname: string;
  /** The cloudflared binary to run, resolved by the cloudflared panel. */
  binaryPath: () => string | undefined;
  /** Start the gateway if it is not running (enabling the tunnel implies it). */
  ensureRunning: () => Promise<void>;
  /** Persist the hostname (the service owns the settings file). */
  onChanged: () => void;
}

/** When to use: `RemoteService` — one tunnel per service. */
export class RemoteTunnel {
  private tunnel: CloudflaredTunnel | null = null;
  private enabled = false;
  private error: string | undefined;
  private hostnameValue: string;
  private readonly deps: RemoteTunnelDeps;

  constructor(deps: RemoteTunnelDeps) {
    this.deps = deps;
    this.hostnameValue = deps.hostname;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  hostname(): string {
    return this.hostnameValue;
  }

  /** Save a hostname (and optionally a new token), restarting a live tunnel. */
  async configure(hostname: string, token?: string): Promise<void> {
    const normalized = normalizeHostname(hostname);
    const value = token?.trim();
    const wasEnabled = this.enabled;
    if (wasEnabled) await this.stop();
    if (value) writePrivateFile(this.deps.tokenPath, `${value}\n`, { ensureDir: this.deps.dataDir });
    this.hostnameValue = normalized;
    this.deps.onChanged();
    if (wasEnabled) await this.setEnabled(true);
  }

  /** Start or stop the tunnel; enabling starts the gateway first. */
  async setEnabled(enabled: boolean): Promise<void> {
    if (!enabled) {
      await this.stop();
      return;
    }
    await this.deps.ensureRunning();
    if (!this.hostnameValue) {
      throw new Error('Set a public hostname and tunnel token first.');
    }
    if (this.tunnel?.status().running) return;
    if (this.tunnel) {
      await this.tunnel.stop();
      this.tunnel = null;
    }

    const token = this.readToken();
    if (!token) {
      throw new Error('A Cloudflare tunnel token is required. Save one in Remote settings.');
    }
    const binaryPath = this.deps.binaryPath();
    if (!binaryPath) {
      this.error = 'cloudflared is not installed. Use INSTALL / UPDATE in Remote settings, or set HB_CLOUDFLARED_PATH.';
      this.enabled = false;
      throw new Error(this.error);
    }

    this.enabled = true;
    this.error = undefined;
    this.tunnel = new CloudflaredTunnel({
      binaryPath,
      argsPrefix: this.deps.argsPrefix,
      logFile: this.deps.logFile,
      onStatus: () => {
        // Status is read on demand by the Settings panel and app IPC.
      },
    });

    try {
      await this.tunnel.start(token);
    } catch (error) {
      this.enabled = false;
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** The saved tunnel token, or undefined when none was configured. */
  readToken(): string | undefined {
    try {
      const value = fs.readFileSync(this.deps.tokenPath, 'utf8').trim();
      return value || undefined;
    } catch {
      return undefined;
    }
  }

  /** Stop and forget the tunnel; the token and hostname stay configured. */
  async stop(): Promise<void> {
    this.enabled = false;
    this.error = undefined;
    if (this.tunnel) {
      await this.tunnel.stop();
      this.tunnel = null;
    }
  }

  status(): RemoteTunnelStatus {
    const binaryPath = this.deps.binaryPath();
    const status = this.tunnel?.status();
    return {
      enabled: this.enabled,
      running: Boolean(status?.running),
      state: status?.state || (this.error ? 'error' : 'stopped'),
      available: Boolean(binaryPath),
      ...(binaryPath ? { binaryPath } : {}),
      ...(this.hostnameValue ? { hostname: this.hostnameValue } : {}),
      tokenConfigured: Boolean(this.readToken()),
      ...(status?.running && this.hostnameValue ? { url: `https://${this.hostnameValue}` } : {}),
      ...(this.error || status?.error ? { error: this.error || status?.error } : {}),
    };
  }

  /** The public endpoint while the tunnel runs, otherwise the local one. */
  publicUrl(localUrl: string): string {
    const running = this.tunnel?.status()?.running;
    if (running && this.hostnameValue) return `https://${this.hostnameValue}/mcp/browser`;
    return localUrl;
  }
}
