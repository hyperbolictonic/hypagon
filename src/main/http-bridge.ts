import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BrowserChassis } from './browser-chassis.js';
import { createBodyReader, createJsonSender, logBridge, setCorsHeaders } from './bridge/http-plumbing.js';
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

/** Paths that count as an action, for `since: "last_action"` network correlation. */
const MUTATING_PATHS = new Set([
  '/navigate',
  '/click',
  '/type',
  '/form/fill',
  '/press-key',
  '/scroll',
  '/marks/click',
  '/marks/type',
  '/act',
]);

/** Routes a person may still call while they hold the browser. */
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

/**
 * Explicit human control pauses the agent, not just its synthetic clicks.
 *
 * Reads (GET) stay available for health/state/observations; mutations are refused
 * until RESUME.
 */
function blockedByHumanControl(chassis: BrowserChassis, method: string, pathname: string): boolean {
  return chassis.isHumanActive() && method !== 'GET' && !HUMAN_CONTROL_ALLOWED.has(pathname);
}

/** Route families in precedence order; the first that claims the request wins. */
async function dispatchRoute(ctx: BridgeContext): Promise<boolean> {
  if (await handleSystemRoutes(ctx)) return true;
  if (await handleMediaRoutes(ctx)) return true;
  if (await handleCollaborationRoutes(ctx)) return true;
  if (await handleViewRoutes(ctx)) return true;
  if (await handleMemoryRoutes(ctx)) return true;
  if (await handleInspectionRoutes(ctx)) return true;
  if (await handleNetworkRoutes(ctx)) return true;
  if (await handleInteractionRoutes(ctx)) return true;
  if (await handleSessionRoutes(ctx)) return true;
  if (await handlePrimitiveRoutes(ctx)) return true;
  if (await handleDecisionRoutes(ctx)) return true;
  if (await handleResearchRoutes(ctx)) return true;
  if (await handleWrapRoutes(ctx)) return true;
  return false;
}

/** Maps a thrown error onto the bridge's failure contract (code, status, detail). */
function sendRouteError(err: any, sendJson: (data: any, status?: number) => void): void {
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
      429,
    );
    return;
  }

  const client = ['BAD_REQUEST', 'STALE_REF', 'NO_TARGET', 'NOT_SUPPORTED', 'TIMEOUT', 'NO_LLM_SURFACE', 'FETCH_BLOCKED',
    'SHADOW_WALK_DISABLED', 'SEALED_DISABLED', 'TAB_WALK_DISABLED', 'FRAMES_DISABLED', 'DEEP_OPEN_ROOTS_DISABLED'].includes(code)
    || code.startsWith('NAVIGATION_');
  sendJson({ success: false, error: err?.message || String(err), code }, client ? 400 : 500);
}

/** The services a bridge serves; the handler closes over them. */
interface BridgeRuntime {
  chassis: BrowserChassis;
  wrap?: WrapBridge;
  toolSettings?: ToolSettingsStore;
  collaboration?: CollaborationService;
  media?: MediaService;
}

/** Builds the per-request function: CORS, body, context, policy, dispatch, errors. */
function createBridgeHandler(runtime: BridgeRuntime) {
  const { chassis, wrap, toolSettings, collaboration, media } = runtime;
  /** Timestamp of the last mutating action, for `since: "last_action"` network correlation. */
  let lastActionAt = Date.now();

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const startTime = Date.now();
    setCorsHeaders(res);

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

    const readBody = createBodyReader(req, chassis, pathname);
    const sendJson = createJsonSender(req, res, pathname, startTime);

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
      if (blockedByHumanControl(chassis, ctx.method, pathname)) {
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

      if (await dispatchRoute(ctx)) return;

      sendJson({ error: 'Endpoint not found' }, 404);
    } catch (err: any) {
      sendRouteError(err, sendJson);
    }
  };
}

/** Bind failure and listen logging, so the factory stays about wiring. */
function wireServerEvents(server: http.Server, chassis: BrowserChassis, port: number): void {
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
}

/** When to use: starting the local REST bridge in the app bootstrap (one per process). */
export function startHttpBridge(
  chassis: BrowserChassis,
  port: number = 4111,
  wrap?: WrapBridge,
  toolSettings?: ToolSettingsStore,
  collaboration?: CollaborationService,
  media?: MediaService
) {
  const server = http.createServer(createBridgeHandler({ chassis, wrap, toolSettings, collaboration, media }));
  wireServerEvents(server, chassis, port);
  return server;
}
