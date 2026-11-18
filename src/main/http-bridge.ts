import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { BrowserChassis } from './browser-chassis.js';
import { dataPath } from './data-paths.js';
import type { WrapBridge } from './bridge/context.js';
import type { BridgeContext } from './bridge/context.js';
import { handleResearchRoutes } from './bridge/routes/research.js';
import { handleSystemRoutes } from './bridge/routes/system.js';
import { handleViewRoutes } from './bridge/routes/view.js';
import { handleMemoryRoutes } from './bridge/routes/memory.js';
import { handleInteractionRoutes } from './bridge/routes/interaction.js';
import { handleSessionRoutes } from './bridge/routes/session.js';
import { handleInspectionRoutes } from './bridge/routes/inspection.js';
import { handleNetworkRoutes } from './bridge/routes/network.js';
import { handlePrimitiveRoutes } from './bridge/routes/primitives.js';
import { handleDecisionRoutes } from './bridge/routes/decision.js';
import { handleWrapRoutes } from './bridge/routes/wrap.js';
import { handleMediaRoutes } from './bridge/routes/media.js';
import { handleCollaborationRoutes } from './bridge/routes/collaboration.js';
import type { ToolSettingsStore } from './tools/settings.js';
import type { CollaborationService } from './collaboration/service.js';
import type { MediaService } from './media/service.js';

export type { WrapBridge } from './bridge/context.js';

function logBridge(message: string, isError = false) {
  const timestamp = new Date().toISOString();
  if (isError) {
    console.error(`[Cyberdeck Bridge ${timestamp}] ${message}`);
  } else {
    console.log(`[Cyberdeck Bridge ${timestamp}] ${message}`);
  }
  try {
    const logDir = dataPath('logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const cleanMsg = message.replace(/\x1b\[[0-9;]*m/g, '');
    fs.appendFileSync(path.join(logDir, 'http-bridge.log'), `[${timestamp}] ${cleanMsg}\n`);
  } catch {
    // Ignore logging disk errors
  }
}

const SECRET_LOG_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'x-api-key',
]);

/** Keep bridge logs useful without copying credentials or wrapper payload secrets into them. */
function redactLogValue(value: any, depth = 0): any {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => redactLogValue(entry, depth + 1));
  const out: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SECRET_LOG_KEYS.has(key.toLowerCase()) ? '<redacted>' : redactLogValue(entry, depth + 1);
  }
  return out;
}

export function startHttpBridge(
  chassis: BrowserChassis,
  port: number = 4111,
  wrap?: WrapBridge,
  toolSettings?: ToolSettingsStore,
  collaboration?: CollaborationService,
  media?: MediaService
) {
  /** Timestamp of the last mutating action, for `since: "last_action"` network correlation. */
  let lastActionAt = Date.now();
  const MUTATING_PATHS = new Set([
    '/navigate', '/click', '/type', '/form/fill', '/press-key', '/scroll',
    '/marks/click', '/marks/type', '/act',
  ]);
  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kuang-Wrap-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    if (req.method === 'POST' && MUTATING_PATHS.has(pathname)) {
      lastActionAt = Date.now();
    }

    if (req.method === 'GET') {
      logBridge(`--> \x1b[36mGET\x1b[0m ${pathname}`);
      chassis.addLog('info', `GET ${pathname}`);
    }

    // Helper to read JSON body
    const readBody = (): Promise<any> =>
      new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            const preview = JSON.stringify(redactLogValue(parsed));
            logBridge(`--> \x1b[35m${req.method}\x1b[0m ${pathname} body: ${preview.length > 300 ? preview.slice(0, 300) + '...' : preview}`);
            chassis.addLog('info', `${req.method} ${pathname}`);
            resolve(parsed);
          } catch {
            logBridge(`--> \x1b[35m${req.method}\x1b[0m ${pathname} body: [Raw/Non-JSON] ${body.slice(0, 100)}`);
            chassis.addLog('info', `${req.method} ${pathname}`);
            resolve({});
          }
        });
      });

    // Helper to send JSON
    const sendJson = (data: any, status = 200) => {
      const duration = Date.now() - startTime;
      const statusColor = status >= 400 ? '\x1b[31m' : '\x1b[32m';
      const summary = status >= 400 ? JSON.stringify(data) : (data?.result ? String(data.result).slice(0, 120) : 'OK');
      logBridge(`<-- ${statusColor}${status}\x1b[0m ${req.method} ${pathname} (${duration}ms) - ${summary}`, status >= 400);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data, null, 2));
    };

    // Shared request context for route families. Cross-cutting policy (CORS, human
    // control, error mapping) stays in this function.
    let parsedBody: Promise<any> | null = null;
    const ctx: BridgeContext = {
      chassis,
      wrap,
      toolSettings,
      collaboration,
      media,
      req,
      res,
      url,
      method: req.method || 'GET',
      pathname,
      startedAt: startTime,
      lastActionAt,
      // The stream can only be consumed once; memoise so a handler (and its helpers)
      // may ask for the body more than once.
      body: () => (parsedBody ??= readBody()),
      json: sendJson,
      fail: (message, status = 400, code = 'BAD_REQUEST') => sendJson({ success: false, error: message, code }, status),
    };

    try {
      // Explicit human control pauses the agent, not just its synthetic clicks. Reads (GET) stay
      // available for health/state/observations; mutations are refused until RESUME.
      const HUMAN_CONTROL_ALLOWED = new Set([
        '/health',
        '/human/status',
        '/human/takeover',
        '/human/resume',
        '/hil/active',
        '/hil/history',
        '/hil/request',
        '/hil/resolve',
        '/hil/cancel',
      ]);
      if (chassis.isHumanActive() && req.method !== 'GET' && !HUMAN_CONTROL_ALLOWED.has(pathname)) {
        sendJson(
          {
            success: false,
            error:
              'HUMAN_CONTROL: a person has taken control of the browser. Wait for them to press RESUME before acting.',
            code: 'HUMAN_CONTROL',
          },
          409,
        );
        return;
      }

      if (await handleSystemRoutes(ctx)) return;

      if (await handleMediaRoutes(ctx)) return;

      if (await handleCollaborationRoutes(ctx)) return;

      if (await handleViewRoutes(ctx)) return;

      if (await handleMemoryRoutes(ctx)) return;

      if (await handleInspectionRoutes(ctx)) return;

      if (await handleNetworkRoutes(ctx)) return;

      if (await handleInteractionRoutes(ctx)) return;

      if (await handleSessionRoutes(ctx)) return;

      if (await handlePrimitiveRoutes(ctx)) return;

      if (await handleDecisionRoutes(ctx)) return;

      if (await handleResearchRoutes(ctx)) return;

      if (await handleWrapRoutes(ctx)) return;

      sendJson({ error: 'Endpoint not found' }, 404);
    } catch (err: any) {
      const code = err?.code || 'INTERNAL';
      if (code === 'JEV_REQUIRED') {
        const detail = err?.detail && typeof err.detail === 'object' ? err.detail : {};
        sendJson({ success: false, error: err?.message || 'Unscoped page reads are disabled while JEV enforce is on.', code, ...detail }, 409);
        return;
      }
      if (code === 'SEALED_RATE_LIMITED') {
        sendJson(
          {
            success: false,
            error: err?.message || 'Sealed discovery is rate-limited.',
            code,
            retry_after: Math.max(1, Math.ceil(Number(err?.retryAfterMs || 0) / 1000)),
          },
          429
        );
        return;
      }
      const client = ['BAD_REQUEST', 'STALE_REF', 'NO_TARGET', 'NOT_SUPPORTED', 'TIMEOUT', 'NO_LLM_SURFACE', 'FETCH_BLOCKED',
        'SHADOW_WALK_DISABLED', 'SEALED_DISABLED', 'TAB_WALK_DISABLED', 'FRAMES_DISABLED', 'DEEP_OPEN_ROOTS_DISABLED'].includes(code)
        || code.startsWith('NAVIGATION_');
      sendJson({ success: false, error: err?.message || String(err), code }, client ? 400 : 500);
    }
  });

  server.on('error', (err: any) => {
    const inUse = err?.code === 'EADDRINUSE';
    const message = inUse
      ? `Port ${port} is already in use — another Cyberdeck (dev or installed) is probably running. ` +
        'Only one bridge can own a port: close the other instance, or start this one with ' +
        'HB_BRIDGE_PORT=<other port> and point the MCP server at it with HB_BRIDGE_URL.'
      : `HTTP Bridge server error on port ${port}: ${err?.message || err}`;
    logBridge(message, true);
    chassis.addLog('warn', message);
  });

  server.listen(port, '127.0.0.1', () => {
    logBridge(`\n======================================================\n 🚀 HYPAGON GATEWAY // CYBERDECK HTTP BRIDGE\n Active at: http://127.0.0.1:${port}\n Live directive logging enabled.\n======================================================\n`);
    chassis.addLog('info', `Autonomous Bridge active at http://127.0.0.1:${port}`);
  });

  return server;
}
