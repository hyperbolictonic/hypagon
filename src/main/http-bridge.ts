import http from 'node:http';
import type { BrowserChassis } from './browser-chassis.js';
import type { ToolSettingsStore } from './tools/settings.js';
import type { CollaborationService } from './collaboration/service.js';
import type { MediaService } from './media/service.js';
import { createRequestContext } from './http/request-context.js';
import { refuseWhileHumanActive } from './http/human-control.js';
import { sendBridgeError } from './http/bridge-errors.js';
import { dispatchBridgeRoutes } from './http/dispatch.js';
import { announceListening, logListenError } from './http/server-lifecycle.js';
import type { WrapBridge } from './http/wrap-routes.js';

export type { WrapBridge };

/** Paths whose completion updates the last-action clock used by network correlation. */
const MUTATING_PATHS = new Set([
  '/navigate', '/click', '/type', '/form/fill', '/press-key', '/scroll',
  '/marks/click', '/marks/type', '/act',
]);

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

    const { readBody, sendJson, sendOk } = createRequestContext({
      req,
      res,
      pathname,
      startTime,
      addLog: (level, message) => chassis.addLog(level, message),
    });

    try {
      // Explicit human control pauses the agent, not just its synthetic clicks. Reads (GET) stay
      // available for health/state/observations; mutations are refused until RESUME.
      if (refuseWhileHumanActive(chassis, req.method, pathname, sendJson)) return;

      const claimed = await dispatchBridgeRoutes({
        method: req.method,
        pathname,
        url,
        readBody,
        sendJson,
        sendOk,
        chassis,
        wrap,
        toolSettings,
        collaboration,
        media,
        headers: req.headers,
        lastActionAt: () => lastActionAt,
      });
      if (claimed) return;

      sendJson({ error: 'Endpoint not found' }, 404);
    } catch (err: any) {
      sendBridgeError(err, sendJson);
    }
  });

  server.on('error', (err: any) => {
    logListenError(port, err, (level, message) => chassis.addLog(level, message));
  });

  server.listen(port, '127.0.0.1', () => {
    announceListening(port, (level, message) => chassis.addLog(level, message));
  });

  return server;
}
