/**
 * The remote gateway child process: spawn, readiness, shutdown and its stderr tail.
 *
 * The gateway is a Node script run by this app's own binary (`ELECTRON_RUN_AS_NODE`),
 * bound to loopback and pointed at the local bridge. Its last 4 KB of stderr is the only
 * diagnostic the status panel can show, so every write is captured here.
 *
 * When to use: `RemoteService` — it owns settings and policy; this owns the process.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const START_TIMEOUT_MS = 8000;
const STOP_TIMEOUT_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canConnect(host: string, port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (ok: boolean): void => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

/** When to use: constructing the gateway child from the app's paths and settings. */
export interface GatewayChildOptions {
  readonly serverPath: string;
  readonly bridgeUrl: string;
  readonly port: number;
  readonly cwd: string;
  readonly runtimePath?: string;
  readonly logFile: string;
  readonly tokenPath: string;
  readonly oauthClientPath: string;
  /** Auth mode at spawn time; a change restarts the child. */
  readonly authMode: () => 'bearer' | 'oauth';
  /** Create the token (and OAuth client) files if missing, before spawning. */
  readonly prepare: () => void;
  /** Whether the gateway is meant to be up — an exit while off is normal. */
  readonly isEnabled: () => boolean;
  /** Whether the named tunnel is attached to this gateway. */
  readonly isTunnelEnabled: () => boolean;
  /** The gateway died while both were on, so the tunnel has to go too. */
  readonly onLostWithTunnel: () => void;
}

/** When to use: starting, stopping and reporting the remote gateway process. */
export class GatewayChild {
  private child: ChildProcess | null = null;
  private lastError = '';
  private readonly options: GatewayChildOptions;

  constructor(options: GatewayChildOptions) {
    this.options = options;
  }

  /** True while a child is attached (it may still be starting). */
  get running(): boolean {
    return Boolean(this.child);
  }

  /** The tail of the gateway's stderr, for the status panel and startup failures. */
  get error(): string {
    return this.lastError;
  }

  /** Clear the recorded error before a fresh start (token rotation does this). */
  clearError(): void {
    this.lastError = '';
  }

  /** Spawn the gateway and wait until its port accepts a connection. */
  async start(): Promise<void> {
    if (this.child) return;
    this.options.prepare();
    if (!fs.existsSync(this.options.serverPath)) {
      throw new Error(`Remote gateway binary not found: ${this.options.serverPath}`);
    }

    this.lastError = '';
    const child = spawn(this.options.runtimePath || process.execPath, [this.options.serverPath], {
      cwd: this.options.cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HB_BRIDGE_URL: this.options.bridgeUrl,
        HB_REMOTE_TOKEN_FILE: this.options.tokenPath,
        HB_REMOTE_PORT: String(this.options.port),
        HB_REMOTE_HOST: '127.0.0.1',
        HB_REMOTE_PATH: '/mcp/browser',
        HB_REMOTE_LOG_FILE: this.options.logFile,
        HB_REMOTE_AUTH_MODE: this.options.authMode(),
        HB_OAUTH_CLIENT_FILE: this.options.oauthClientPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.child = child;
    child.stdout?.resume();
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.lastError = `${this.lastError}${text}`.slice(-4000);
      this.appendLog(text);
    });
    child.once('error', (error) => {
      this.lastError = `${error.message}\n${this.lastError}`.slice(-4000);
      this.appendLog(`${error.message}\n`);
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) this.child = null;
      const enabled = this.options.isEnabled();
      if (code !== 0 && enabled) {
        this.lastError = `Remote gateway exited (${signal || code}).\n${this.lastError}`.slice(-4000);
      }
      if (enabled && this.options.isTunnelEnabled()) this.options.onLostWithTunnel();
      this.appendLog(`gateway exited code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    });

    try {
      await this.waitForPort();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /** Stop the child: SIGTERM, wait, then SIGKILL if it is still there. */
  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    try {
      child.kill('SIGTERM');
    } catch (error) {
      this.appendLog(`SIGTERM failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    await Promise.race([once(child, 'exit').then(() => undefined), delay(STOP_TIMEOUT_MS)]);
    if (child.exitCode === null) {
      try {
        child.kill('SIGKILL');
      } catch (error) {
        this.appendLog(`SIGKILL failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  }

  private async waitForPort(): Promise<void> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.child) {
        throw new Error(this.lastError || 'Remote gateway exited during startup.');
      }
      if (await canConnect('127.0.0.1', this.options.port)) return;
      await delay(150);
    }
    throw new Error(`Remote gateway did not start on 127.0.0.1:${this.options.port}. ${this.lastError}`.trim());
  }

  private appendLog(text: string): void {
    try {
      fs.mkdirSync(path.dirname(this.options.logFile), { recursive: true });
      fs.appendFileSync(this.options.logFile, text, 'utf8');
    } catch {
      // Diagnostics are best-effort.
    }
  }
}
