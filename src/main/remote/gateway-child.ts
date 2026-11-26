/**
 * The remote gateway child process: spawn, readiness, log capture and stop.
 *
 * Why a module: the service's status methods reasoned about a `ChildProcess`
 * field, its stderr buffer and a port probe. Those three only talk to each
 * other, so they live here; the service asks whether it is running and what the
 * last error was.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { RemoteAuth } from './auth.js';

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

/** When to use: the service constructor — everything the child is launched with. */
export interface RemoteGatewayDeps {
  serverPath: string;
  bridgeUrl: string;
  port: number;
  cwd: string;
  runtimePath?: string;
  logFile: string;
  tokenPath: string;
  oauthClientPath: string;
  auth: () => RemoteAuth;
  /** Whether the operator wants the gateway up; a non-zero exit is only an error while true. */
  isEnabled: () => boolean;
  /** A crash while both switches were on: the tunnel cannot survive it. */
  onUnexpectedExit: () => void;
}

/** When to use: `RemoteService` — one child per service. */
export class RemoteGateway {
  private child: ChildProcess | null = null;
  private lastError = '';
  private readonly deps: RemoteGatewayDeps;

  constructor(deps: RemoteGatewayDeps) {
    this.deps = deps;
  }

  running(): boolean {
    return Boolean(this.child);
  }

  /** The tail of stderr (and exit reasons), for the status panel. */
  error(): string {
    return this.lastError;
  }

  clearError(): void {
    this.lastError = '';
  }

  /** Spawn the gateway and wait until its port answers. */
  async start(): Promise<void> {
    if (this.child) return;
    this.deps.auth().ensure();
    if (this.deps.auth().mode() === 'oauth') this.deps.auth().oauthClient();
    if (!fs.existsSync(this.deps.serverPath)) {
      throw new Error(`Remote gateway binary not found: ${this.deps.serverPath}`);
    }

    this.lastError = '';
    const child = spawn(this.deps.runtimePath || process.execPath, [this.deps.serverPath], {
      cwd: this.deps.cwd,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HB_BRIDGE_URL: this.deps.bridgeUrl,
        HB_REMOTE_TOKEN_FILE: this.deps.tokenPath,
        HB_REMOTE_PORT: String(this.deps.port),
        HB_REMOTE_HOST: '127.0.0.1',
        HB_REMOTE_PATH: '/mcp/browser',
        HB_REMOTE_LOG_FILE: this.deps.logFile,
        HB_REMOTE_AUTH_MODE: this.deps.auth().mode(),
        HB_OAUTH_CLIENT_FILE: this.deps.oauthClientPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.child = child;
    child.stdout?.resume();
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      this.lastError = `${this.lastError}${text}`.slice(-4000);
      this.log(text);
    });
    child.once('error', (error) => {
      this.lastError = `${error.message}\n${this.lastError}`.slice(-4000);
      this.log(`${error.message}\n`);
    });
    child.once('exit', (code, signal) => {
      if (this.child === child) this.child = null;
      if (code !== 0 && this.deps.isEnabled()) {
        this.lastError = `Remote gateway exited (${signal || code}).\n${this.lastError}`.slice(-4000);
      }
      if (this.deps.isEnabled()) this.deps.onUnexpectedExit();
      this.log(`gateway exited code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
    });

    try {
      await this.waitForPort();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /** SIGTERM, then SIGKILL after the grace period. */
  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    try {
      child.kill('SIGTERM');
    } catch (error) {
      this.log(`SIGTERM failed: ${error instanceof Error ? error.message : String(error)}\n`);
    }
    await Promise.race([once(child, 'exit').then(() => undefined), delay(STOP_TIMEOUT_MS)]);
    if (child.exitCode === null) {
      try {
        child.kill('SIGKILL');
      } catch (error) {
        this.log(`SIGKILL failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  }

  private async waitForPort(): Promise<void> {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!this.child) {
        throw new Error(this.lastError || 'Remote gateway exited during startup.');
      }
      if (await canConnect('127.0.0.1', this.deps.port)) return;
      await delay(150);
    }
    throw new Error(`Remote gateway did not start on 127.0.0.1:${this.deps.port}. ${this.lastError}`.trim());
  }

  private log(text: string): void {
    try {
      fs.mkdirSync(path.dirname(this.deps.logFile), { recursive: true });
      fs.appendFileSync(this.deps.logFile, text, 'utf8');
    } catch {
      // Diagnostics are best-effort.
    }
  }
}
