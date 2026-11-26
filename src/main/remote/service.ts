/**
 * The app-level remote MCP gateway.
 *
 * The service is deliberately independent of Electron: the app injects paths
 * and the bridge URL. It never exposes a non-loopback listener and never
 * proxies the raw bridge.
 *
 * Why this file is small: the gateway child is `gateway-child.ts`, the
 * cloudflared binary and its updates are `cloudflared-panel.ts`, the named
 * tunnel is `tunnel.ts`, the credentials are `auth.ts`, and the transitions
 * that span them (enable, auth mode, rotations, session cycling) are `access.ts`.
 * This class wires the four controllers, owns the settings file, and composes
 * the status the IPC and the Settings panel read.
 */
import path from 'node:path';
import { tokenPathIn } from '../security/capability-token.ts';
import { oauthClientFile } from './oauth-client.ts';
import { loadRemoteSettings, saveRemoteSettings } from './settings.ts';
import { RemoteAccess } from './access.ts';
import { RemoteAuth } from './auth.ts';
import { CloudflaredPanel } from './cloudflared-panel.ts';
import { RemoteGateway } from './gateway-child.ts';
import { RemoteTunnel } from './tunnel.ts';
import type { RemoteInfo, RemoteStatus } from '../../shared/remote.js';

/** When to use: the app bootstrap — the paths, port and bridge the gateway fronts. */
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

/** The local endpoint the gateway always listens on. */
function localUrlFor(port: number): string {
  return `http://127.0.0.1:${port}/mcp/browser`;
}

/** When to use: the app — one service per process. */
export class RemoteService {
  private readonly options: RemoteServiceOptions;
  private readonly tokenPath: string;
  private readonly settingsPath: string;

  /** The capability token and the OAuth client. */
  readonly auth: RemoteAuth;
  /** The gateway child process. */
  readonly gateway: RemoteGateway;
  /** The cloudflared binary and its update state. */
  readonly cloudflared: CloudflaredPanel;
  /** The named tunnel in front of the gateway. */
  readonly tunnel: RemoteTunnel;
  /** The transitions that span the three above. */
  readonly access: RemoteAccess;

  constructor(options: RemoteServiceOptions) {
    this.options = options;
    this.tokenPath = tokenPathIn(options.dataDir);
    this.settingsPath = path.join(options.dataDir, 'settings.json');
    const oauthClientPath = oauthClientFile(options.dataDir);
    const settings = loadRemoteSettings(this.settingsPath);

    const persist = (): void => {
      saveRemoteSettings(this.settingsPath, {
        schemaVersion: 1,
        cloudflaredUpdateMode: this.cloudflared.updateMode(),
        authMode: this.auth.mode(),
        tunnelHostname: this.tunnel.hostname(),
      });
    };

    this.auth = new RemoteAuth({
      dataDir: options.dataDir,
      tokenPath: this.tokenPath,
      oauthClientPath,
      mode: settings.authMode,
      onChanged: persist,
    });

    this.cloudflared = new CloudflaredPanel({
      dataDir: options.dataDir,
      cloudflaredPath: options.cloudflaredPath,
      updateMode: settings.cloudflaredUpdateMode,
      onChanged: persist,
      tunnelEnabled: () => this.tunnel.isEnabled(),
      pauseTunnel: () => this.tunnel.stop(),
      resumeTunnel: async () => {
        await this.tunnel.setEnabled(true);
      },
    });

    this.tunnel = new RemoteTunnel({
      dataDir: options.dataDir,
      tokenPath: path.join(options.dataDir, 'tunnel-token'),
      logFile: path.join(options.dataDir, 'named-tunnel.log'),
      argsPrefix: options.tunnelArgsPrefix,
      hostname: settings.tunnelHostname,
      binaryPath: () => this.cloudflared.binaryPath(),
      ensureRunning: async () => {
        await this.access.setEnabled(true);
      },
      onChanged: persist,
    });

    this.gateway = new RemoteGateway({
      serverPath: options.serverPath,
      bridgeUrl: options.bridgeUrl,
      port: options.port,
      cwd: options.cwd,
      runtimePath: options.runtimePath,
      logFile: options.logFile || path.join(options.dataDir, 'remote-server.log'),
      tokenPath: this.tokenPath,
      oauthClientPath,
      auth: () => this.auth,
      isEnabled: () => this.access.isEnabled(),
      onUnexpectedExit: () => {
        if (this.tunnel.isEnabled()) void this.tunnel.stop();
      },
    });

    this.access = new RemoteAccess({
      auth: () => this.auth,
      gateway: () => this.gateway,
      tunnel: () => this.tunnel,
      status: () => this.status(),
    });
  }

  status(): RemoteStatus {
    const localUrl = localUrlFor(this.options.port);
    const error = this.gateway.error();
    return {
      enabled: this.access.isEnabled(),
      running: this.gateway.running(),
      port: this.options.port,
      localUrl,
      url: this.tunnel.publicUrl(localUrl),
      tokenFile: this.tokenPath,
      authMode: this.auth.mode(),
      tunnel: this.tunnel.status(),
      cloudflared: this.cloudflared.status(),
      ...(error ? { error } : {}),
    };
  }

  getInfo(): RemoteInfo {
    return {
      status: this.status(),
      token: this.auth.token(),
      config: this.getConfig(),
      tunnelHostname: this.tunnel.hostname(),
      tunnelTokenConfigured: Boolean(this.tunnel.readToken()),
      ...(this.auth.mode() === 'oauth' ? { oauthClient: this.auth.oauthClient() } : {}),
    };
  }

  getConfig(): string {
    return JSON.stringify(
      {
        mcpServers: {
          'hypagon-browser': {
            httpUrl: this.tunnel.publicUrl(localUrlFor(this.options.port)),
            headers: { Authorization: `Bearer ${this.auth.token()}` },
          },
        },
      },
      null,
      2,
    );
  }

  /** Shut down for app quit: drop the tunnel, then the gateway. */
  async stop(): Promise<void> {
    await this.access.setEnabled(false);
  }
}
