import fs from 'node:fs';
import path from 'node:path';
import { createBearerAuthorizer, createMcpHttpHost } from '../../packages/mcp-http/src/index.ts';
import { McpOAuthServer } from '../../packages/mcp-oauth/src/index.ts';
import { createBridgeMcpServer, flushLogSync } from './browser-mcp.js';
import { readCapabilityToken } from '../main/security/capability-token.js';
import { readOAuthClient } from '../main/remote/oauth-client.js';

const DEFAULT_PORT = 4112;
const DEFAULT_PATH = '/mcp/browser';
const DEFAULT_MAX_SESSIONS = 8;
const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60_000;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;

const LOG_FILE = process.env.HB_REMOTE_LOG_FILE || path.resolve(process.cwd(), 'data', 'logs', 'remote-server.log');

function logRemote(event: string, detail?: Record<string, unknown>): void {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    event,
    ...(detail ? { ...detail } : {}),
  });
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
  } catch {
    // Logging is best-effort; it must not take down the gateway.
  }
  try {
    process.stderr.write(`[remote-mcp] ${line}\n`);
  } catch {
    // Never let diagnostics crash the gateway.
  }
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function portNumber(value: string | undefined): number {
  const port = positiveInteger(value, DEFAULT_PORT);
  if (port > 65_535) throw new Error('HB_REMOTE_PORT must be between 1 and 65535');
  return port;
}

function loopbackHost(value: string | undefined): string {
  if (!value || value === '127.0.0.1' || value === 'localhost') return '127.0.0.1';
  if (value === '::1') return '::1';
  throw new Error('HB_REMOTE_HOST must be a loopback address');
}

function mcpPath(value: string | undefined): string {
  const raw = (value || DEFAULT_PATH).trim();
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
}

/** Everything the gateway needs, validated once at boot. */
interface RemoteConfig {
  tokenFile: string;
  port: number;
  host: string;
  pathName: string;
  maxSessions: number;
  idleTimeoutMs: number;
  maxRequestBodyBytes: number;
  authMode: 'bearer' | 'oauth';
  stateless: boolean;
  /** Non-null in OAuth mode; the gateway then delegates authorization to it. */
  oauth: McpOAuthServer | null;
}

/** The OAuth authorizer, when `HB_REMOTE_AUTH_MODE=oauth`. */
function createOAuth(pathName: string): McpOAuthServer {
  const clientFile = process.env.HB_OAUTH_CLIENT_FILE?.trim();
  if (!clientFile) throw new Error('HB_OAUTH_CLIENT_FILE is required for OAuth mode');
  const client = readOAuthClient(clientFile);
  if (!client) throw new Error('OAuth client credentials are missing or invalid');
  const redirectHosts = (process.env.HB_OAUTH_REDIRECT_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return new McpOAuthServer({
    clientId: client.clientId,
    clientSecret: client.clientSecret,
    resourcePath: pathName,
    allowedRedirectHosts: redirectHosts.length ? redirectHosts : undefined,
    logger: logRemote,
  });
}

/** Read and validate the gateway environment; a bad value throws before anything listens. */
function readConfig(): RemoteConfig {
  const tokenFile = process.env.HB_REMOTE_TOKEN_FILE?.trim();
  if (!tokenFile) {
    throw new Error('HB_REMOTE_TOKEN_FILE is required');
  }

  const port = portNumber(process.env.HB_REMOTE_PORT);
  const host = loopbackHost(process.env.HB_REMOTE_HOST);
  const pathName = mcpPath(process.env.HB_REMOTE_PATH);
  const authMode = process.env.HB_REMOTE_AUTH_MODE === 'oauth' ? 'oauth' : 'bearer';

  return {
    tokenFile,
    port,
    host,
    pathName,
    maxSessions: positiveInteger(process.env.HB_REMOTE_MAX_SESSIONS, DEFAULT_MAX_SESSIONS),
    idleTimeoutMs: positiveInteger(process.env.HB_REMOTE_IDLE_MS, DEFAULT_IDLE_TIMEOUT_MS),
    maxRequestBodyBytes: positiveInteger(process.env.HB_REMOTE_MAX_BODY_BYTES, DEFAULT_MAX_BODY_BYTES),
    authMode,
    stateless: process.env.HB_REMOTE_STATEFUL !== '1',
    oauth: authMode === 'oauth' ? createOAuth(pathName) : null,
  };
}

/** The HTTP host: bearer by default, the OAuth server's authorize/challenge when configured. */
function createGateway(config: RemoteConfig) {
  const { oauth } = config;
  return createMcpHttpHost({
    host: config.host,
    port: config.port,
    path: config.pathName,
    createServer: createBridgeMcpServer,
    authorize: oauth
      ? (request) => oauth.authorize(request)
      : createBearerAuthorizer(() => readCapabilityToken(config.tokenFile), 'remote-operator'),
    ...(oauth
      ? {
          handleExtraRequest: (request, response, url) => oauth.handleRequest(request, response, url),
          authChallenge: (request) => oauth.challenge(request),
        }
      : {}),
    enableJsonResponse: true,
    allowSse: false,
    stateless: config.stateless,
    maxSessions: config.maxSessions,
    idleTimeoutMs: config.idleTimeoutMs,
    maxRequestBodyBytes: config.maxRequestBodyBytes,
    logger: logRemote,
  });
}

/** Stop on SIGINT/SIGTERM: close the host and the OAuth server, flush the log, exit clean. */
function wireShutdown(gateway: ReturnType<typeof createMcpHttpHost>, oauth: McpOAuthServer | null): void {
  const stop = async (signal: string): Promise<void> => {
    logRemote('gateway_stopping', { signal });
    try {
      await gateway.stop();
      oauth?.stop();
    } catch (error) {
      logRemote('gateway_stop_error', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      flushLogSync();
      process.exit(0);
    }
  };

  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
}

async function main(): Promise<void> {
  const config = readConfig();
  const gateway = createGateway(config);

  await gateway.start();
  logRemote('gateway_listening', {
    url: `http://${config.host}:${gateway.status().port}${config.pathName}`,
    authMode: config.authMode,
    stateless: config.stateless,
    maxSessions: config.maxSessions,
    idleTimeoutMs: config.idleTimeoutMs,
  });

  wireShutdown(gateway, config.oauth);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logRemote('gateway_fatal', { message });
  flushLogSync();
  process.exit(1);
});
