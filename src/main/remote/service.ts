/**
 * The app-level remote MCP gateway.
 *
 * It stays independent of Electron: the app injects paths and the bridge URL. It never
 * exposes a non-loopback listener and never proxies the raw bridge — the gateway is a
 * separate Node process on loopback, optionally published through a named tunnel.
 *
 * Three collaborators own the moving parts: `GatewayChild` (the process),
 * `RemoteTunnel` (credentials and the cloudflared tunnel) and `CloudflaredControl`
 * (the installed binary). This service owns the public API, settings and status.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRemoteToken, readRemoteToken, remoteTokenFile } from './token.ts';
import { ensureOAuthClient, oauthClientFile, createOAuthClient } from './oauth-client.ts';
import type { OAuthClientCredentials } from './oauth-client.ts';
import type { CloudflaredUpdateMode } from '../../../packages/cloudflared/src/index.ts';
import { loadRemoteSettings, saveRemoteSettings } from './settings.ts';
import { GatewayChild } from './gateway-child.ts';
import { RemoteTunnel } from './tunnel.ts';
import { CloudflaredControl } from './cloudflared-control.ts';
import type { RemoteInfo, RemoteStatus } from '../../shared/remote.js';

/** When to use: constructing the remote gateway service (ports, tunnel, tokens). */
export interface RemoteServiceOptions {
  serverPath: string;
  bridgeUrl: string;
  port: number;
  dataDir: string;
  cwd: string;
  runtimePath?: string;
  logFile?: string;
  cloudflaredPath?: string;
  tunnelArgsPrefix?: string[];
}

/** When to use: the IPC/HTTP surface for Remote settings, tokens and status. */
export class RemoteService {
  private enabled = false;
  private readonly options: RemoteServiceOptions;
  private readonly tokenPath: string;
  private readonly settingsPath: string;
  private readonly oauthClientPath: string;
  private readonly gateway: GatewayChild;
  private readonly tunnelControl: RemoteTunnel;
  private readonly cloudflaredControl: CloudflaredControl;
  private updateMode: CloudflaredUpdateMode;
  private authMode: 'bearer' | 'oauth';

  constructor(options: RemoteServiceOptions) {
    this.options = options;
    this.tokenPath = remoteTokenFile(options.dataDir);
    this.settingsPath = path.join(options.dataDir, 'settings.json');
    this.oauthClientPath = oauthClientFile(options.dataDir);
    const settings = loadRemoteSettings(this.settingsPath);
    this.updateMode = settings.cloudflaredUpdateMode;
    this.authMode = settings.authMode;

    const logFile = options.logFile || path.join(options.dataDir, 'remote-server.log');
    this.cloudflaredControl = new CloudflaredControl({
      dataDir: options.dataDir,
      ...(options.cloudflaredPath === undefined ? {} : { configuredPath: options.cloudflaredPath }),
    });
    this.gateway = new GatewayChild({
      serverPath: options.serverPath,
      bridgeUrl: options.bridgeUrl,
      port: options.port,
      cwd: options.cwd,
      ...(options.runtimePath === undefined ? {} : { runtimePath: options.runtimePath }),
      logFile,
      tokenPath: this.tokenPath,
      oauthClientPath: this.oauthClientPath,
      authMode: () => this.authMode,
      prepare: () => {
        this.ensureToken();
        if (this.authMode === 'oauth') ensureOAuthClient(this.oauthClientPath);
      },
      isEnabled: () => this.enabled,
      isTunnelEnabled: () => this.tunnelControl.isEnabled,
      onLostWithTunnel: () => void this.tunnelControl.stop(),
    });
    this.tunnelControl = new RemoteTunnel({
      dataDir: options.dataDir,
      tokenPath: path.join(options.dataDir, 'tunnel-token'),
      logFile: path.join(options.dataDir, 'named-tunnel.log'),
      ...(options.tunnelArgsPrefix === undefined ? {} : { argsPrefix: options.tunnelArgsPrefix }),
      hostname: settings.tunnelHostname,
      resolveBinary: () => this.cloudflaredControl.localPath(),
      ensureGateway: async () => {
        if (this.gateway.running) return;
        this.enabled = true;
        try {
          await this.gateway.start();
        } catch (error) {
          this.enabled = false;
          throw error;
        }
      },
      onChange: () => this.saveSettings(),
    });
  }

  ensureToken(): string {
    const existing = readRemoteToken(this.tokenPath);
    if (existing) return existing;
    fs.mkdirSync(this.options.dataDir, { recursive: true });
    return createRemoteToken(this.options.dataDir);
  }

  getToken(): string {
    return this.ensureToken();
  }

  getInfo(): RemoteInfo {
    return {
      status: this.status(),
      token: this.getToken(),
      config: this.getConfig(),
      tunnelHostname: this.tunnelControl.hostname,
      tunnelTokenConfigured: this.tunnelControl.tokenConfigured,
      ...(this.authMode === 'oauth' ? { oauthClient: this.getOAuthClient() } : {}),
    };
  }

  getConfig(): string {
    return JSON.stringify(
      {
        mcpServers: {
          'hypagon-browser': {
            httpUrl: this.tunnelControl.publicUrl(this.localUrl()),
            headers: { Authorization: `Bearer ${this.getToken()}` },
          },
        },
      },
      null,
      2,
    );
  }

  status(): RemoteStatus {
    return {
      enabled: this.enabled,
      running: this.gateway.running,
      port: this.options.port,
      localUrl: this.localUrl(),
      url: this.tunnelControl.publicUrl(this.localUrl()),
      tokenFile: this.tokenPath,
      authMode: this.authMode,
      tunnel: this.tunnelControl.status(),
      cloudflared: this.cloudflaredControl.describe(this.updateMode),
      ...(this.gateway.error ? { error: this.gateway.error } : {}),
    };
  }

  isRunning(): boolean {
    return this.gateway.running;
  }

  async setCloudflaredUpdateMode(mode: CloudflaredUpdateMode): Promise<RemoteStatus> {
    this.updateMode = mode === 'automatic' ? 'automatic' : 'manual';
    this.saveSettings();
    return this.status();
  }

  getOAuthClient(): OAuthClientCredentials {
    return ensureOAuthClient(this.oauthClientPath);
  }

  async setAuthMode(mode: 'bearer' | 'oauth'): Promise<RemoteStatus> {
    const next = mode === 'oauth' ? 'oauth' : 'bearer';
    if (next === this.authMode) return this.status();
    const wasRunning = this.gateway.running;
    if (wasRunning) await this.gateway.stop();
    this.authMode = next;
    if (next === 'oauth') ensureOAuthClient(this.oauthClientPath);
    this.saveSettings();
    if (wasRunning) {
      this.enabled = true;
      try {
        await this.gateway.start();
      } catch (error) {
        this.enabled = false;
        throw error;
      }
    }
    return this.status();
  }

  async rotateOAuthClient(): Promise<RemoteStatus> {
    const wasRunning = this.gateway.running;
    if (wasRunning) await this.gateway.stop();
    createOAuthClient(this.oauthClientPath);
    if (wasRunning) {
      this.enabled = true;
      try {
        await this.gateway.start();
      } catch (error) {
        this.enabled = false;
        throw error;
      }
    }
    return this.status();
  }

  private saveSettings(): void {
    saveRemoteSettings(this.settingsPath, {
      schemaVersion: 1,
      cloudflaredUpdateMode: this.updateMode,
      authMode: this.authMode,
      tunnelHostname: this.tunnelControl.hostname,
    });
  }

  async setTunnelHostname(hostname: string): Promise<RemoteStatus> {
    await this.tunnelControl.setHostname(hostname);
    return this.status();
  }

  async setTunnelToken(token: string): Promise<RemoteStatus> {
    await this.tunnelControl.setToken(token);
    return this.status();
  }

  async setTunnelConfig(hostname: string, token?: string): Promise<RemoteStatus> {
    await this.tunnelControl.setConfig(hostname, token);
    return this.status();
  }

  async checkCloudflared(): Promise<RemoteStatus> {
    await this.cloudflaredControl.check();
    return this.status();
  }

  async installCloudflared(): Promise<RemoteStatus> {
    const wasTunnelEnabled = this.tunnelControl.isEnabled;
    if (wasTunnelEnabled) await this.tunnelControl.stop();
    await this.cloudflaredControl.install();
    if (wasTunnelEnabled) await this.setTunnelEnabled(true);
    return this.status();
  }

  async maybeAutoUpdateCloudflared(): Promise<RemoteStatus> {
    if (this.updateMode !== 'automatic') return this.status();
    if (!this.cloudflaredControl.installed()) return this.status();
    if (await this.cloudflaredControl.autoCheck(this.updateMode)) await this.installCloudflared();
    return this.status();
  }

  async setEnabled(enabled: boolean): Promise<RemoteStatus> {
    if (enabled) {
      this.enabled = true;
      try {
        await this.gateway.start();
      } catch (error) {
        this.enabled = false;
        throw error;
      }
    } else {
      this.enabled = false;
      await this.tunnelControl.stop();
      await this.gateway.stop();
    }
    return this.status();
  }

  async setTunnelEnabled(enabled: boolean): Promise<RemoteStatus> {
    await this.tunnelControl.setEnabled(enabled);
    return this.status();
  }

  async rotateToken(): Promise<RemoteStatus> {
    const wasEnabled = this.enabled;
    await this.gateway.stop();
    createRemoteToken(this.options.dataDir);
    this.gateway.clearError();
    if (wasEnabled) {
      this.enabled = true;
      await this.gateway.start();
    }
    return this.status();
  }

  async disconnectSessions(): Promise<RemoteStatus> {
    if (!this.enabled) return this.status();
    await this.gateway.stop();
    await this.gateway.start();
    return this.status();
  }

  async stop(): Promise<void> {
    this.enabled = false;
    await this.tunnelControl.stop();
    await this.gateway.stop();
  }

  private localUrl(): string {
    return `http://127.0.0.1:${this.options.port}/mcp/browser`;
  }
}
