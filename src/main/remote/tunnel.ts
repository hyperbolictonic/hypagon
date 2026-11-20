/**
 * The named Cloudflare tunnel: its credentials, hostname and lifecycle.
 *
 * A tunnel is only meaningful with both a hostname and a token, so they are stored and
 * validated together. The token file is written atomically with 0600 permissions and
 * read fail-open (a missing file simply means "not configured"). Enabling the tunnel
 * starts the gateway first when it is not already up.
 *
 * When to use: `RemoteService` — it owns the public API and settings persistence; this
 * owns the tunnel process and its credential files.
 */
import fs from 'node:fs';
import { CloudflaredTunnel } from '../../../packages/cloudflared-tunnel/src/index.ts';
import type { RemoteTunnelStatus } from '../../shared/remote.js';

/** When to use: an unreadable or blank token file means the tunnel is not configured. */
export function readTunnelToken(tokenPath: string): string | undefined {
  try {
    const value = fs.readFileSync(tokenPath, 'utf8').trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

/** When to use: saving a tunnel token — atomic replace, then 0600 where supported. */
export function writeTunnelToken(dataDir: string, tokenPath: string, value: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const temp = `${tokenPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, `${value}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, tokenPath);
  try {
    fs.chmodSync(tokenPath, 0o600);
  } catch {
    // Windows uses ACLs; the userData directory is already user-private.
  }
}

/** When to use: accepting a hostname from Settings — full DNS names only. */
export function normalizeHostname(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error('Public hostname is required.');
  let hostname = raw;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    hostname = parsed.hostname;
  } catch {
    throw new Error('Public hostname is not valid.');
  }
  hostname = hostname.toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || !hostname.includes('.')) {
    throw new Error('Public hostname must be a full DNS name, for example mcp.example.com.');
  }
  return hostname;
}

/** When to use: constructing the tunnel controller from the service's paths. */
export interface RemoteTunnelOptions {
  readonly dataDir: string;
  readonly tokenPath: string;
  readonly logFile: string;
  readonly argsPrefix?: string[];
  /** Hostname restored from settings. */
  readonly hostname: string;
  /** Resolved cloudflared binary, or undefined when neither managed nor system. */
  readonly resolveBinary: () => string | undefined;
  /** Start the gateway first when it is not running; throws on failure. */
  readonly ensureGateway: () => Promise<void>;
  /** Persist a hostname change. */
  readonly onChange: () => void;
}

/** When to use: the named tunnel behind Remote settings (enable, hostname, token). */
export class RemoteTunnel {
  private tunnel: CloudflaredTunnel | null = null;
  private enabled = false;
  private error: string | undefined;
  private hostnameValue: string;
  private readonly options: RemoteTunnelOptions;

  constructor(options: RemoteTunnelOptions) {
    this.options = options;
    this.hostnameValue = options.hostname;
  }

  /** The configured public hostname ('' when unset). */
  get hostname(): string {
    return this.hostnameValue;
  }

  /** Whether the human asked for the tunnel to run. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Whether a token file is present. */
  get tokenConfigured(): boolean {
    return Boolean(readTunnelToken(this.options.tokenPath));
  }

  /** When to use: the `tunnel` section of Remote status. */
  status(): RemoteTunnelStatus {
    const binaryPath = this.options.resolveBinary();
    const status = this.tunnel?.status();
    return {
      enabled: this.enabled,
      running: Boolean(status?.running),
      state: status?.state || (this.error ? 'error' : 'stopped'),
      available: Boolean(binaryPath),
      ...(binaryPath ? { binaryPath } : {}),
      ...(this.hostnameValue ? { hostname: this.hostnameValue } : {}),
      tokenConfigured: this.tokenConfigured,
      ...(status?.running && this.hostnameValue ? { url: `https://${this.hostnameValue}` } : {}),
      ...(this.error || status?.error ? { error: this.error || status?.error } : {}),
    };
  }

  /** When to use: the MCP URL a client should use — the tunnel while it runs. */
  publicUrl(localUrl: string): string {
    const status = this.tunnel?.status();
    if (status?.running && this.hostnameValue) return `https://${this.hostnameValue}/mcp/browser`;
    return localUrl;
  }

  /** When to use: changing the hostname from Remote settings. */
  async setHostname(hostname: string): Promise<void> {
    const normalized = normalizeHostname(hostname);
    const wasEnabled = this.enabled;
    if (wasEnabled) await this.stop();
    this.hostnameValue = normalized;
    this.options.onChange();
    if (wasEnabled) await this.setEnabled(true);
  }

  /** When to use: saving a new tunnel token from Remote settings. */
  async setToken(token: string): Promise<void> {
    const value = token.trim();
    if (!value) throw new Error('Tunnel token cannot be empty.');
    const wasEnabled = this.enabled;
    if (wasEnabled) await this.stop();
    writeTunnelToken(this.options.dataDir, this.options.tokenPath, value);
    if (wasEnabled) await this.setEnabled(true);
  }

  /** When to use: the "save both" button — hostname and optional new token at once. */
  async setConfig(hostname: string, token?: string): Promise<void> {
    const normalized = normalizeHostname(hostname);
    const value = token?.trim();
    const wasEnabled = this.enabled;
    if (wasEnabled) await this.stop();
    if (value) writeTunnelToken(this.options.dataDir, this.options.tokenPath, value);
    this.hostnameValue = normalized;
    this.options.onChange();
    if (wasEnabled) await this.setEnabled(true);
  }

  /** When to use: the tunnel switch — starts the gateway when needed. */
  async setEnabled(enabled: boolean): Promise<void> {
    if (!enabled) {
      await this.stop();
      return;
    }
    await this.options.ensureGateway();
    if (!this.hostnameValue) {
      throw new Error('Set a public hostname and tunnel token first.');
    }
    if (this.tunnel?.status().running) return;
    if (this.tunnel) {
      await this.tunnel.stop();
      this.tunnel = null;
    }

    const token = readTunnelToken(this.options.tokenPath);
    if (!token) {
      throw new Error('A Cloudflare tunnel token is required. Save one in Remote settings.');
    }
    const binaryPath = this.options.resolveBinary();
    if (!binaryPath) {
      this.error = 'cloudflared is not installed. Use INSTALL / UPDATE in Remote settings, or set HB_CLOUDFLARED_PATH.';
      this.enabled = false;
      throw new Error(this.error);
    }

    this.enabled = true;
    this.error = undefined;
    this.tunnel = new CloudflaredTunnel({
      binaryPath,
      argsPrefix: this.options.argsPrefix,
      logFile: this.options.logFile,
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

  /** When to use: stopping the tunnel without touching the gateway. */
  async stop(): Promise<void> {
    this.enabled = false;
    this.error = undefined;
    if (this.tunnel) {
      await this.tunnel.stop();
      this.tunnel = null;
    }
  }
}
