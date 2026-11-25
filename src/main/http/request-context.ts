/**
 * The per-request context every route family receives.
 *
 * Why a module: reading the JSON body and writing the JSON answer are the two
 * things every route shares, and both have subtle rules — the body logger
 * redacts secrets, a non-JSON body degrades to `{}`, and the response logs a
 * status-coloured duration. Owning them here keeps those rules identical for
 * all families and keeps the server callback down to transport wiring.
 */
import type http from 'node:http';
import type { RouteTableContext } from './route-table.js';
import { logBridge, redactLogValue } from './bridge-log.js';

/** When to use: a route family needs the request body reader and the JSON senders. */
export type BridgeRequestContext = Pick<RouteTableContext, 'readBody' | 'sendJson' | 'sendOk'>;

/** When to use: the bridge request handler — build the helpers for one request. */
export function createRequestContext(options: {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  pathname: string;
  startTime: number;
  addLog: (level: 'info' | 'warn' | 'action', message: string) => void;
}): BridgeRequestContext {
  const { req, res, pathname, startTime, addLog } = options;

  if (req.method === 'GET') {
    logBridge(`--> \x1b[36mGET\x1b[0m ${pathname}`);
    addLog('info', `GET ${pathname}`);
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
          logBridge(
            `--> \x1b[35m${req.method}\x1b[0m ${pathname} body: ${preview.length > 300 ? preview.slice(0, 300) + '...' : preview}`,
          );
          addLog('info', `${req.method} ${pathname}`);
          resolve(parsed);
        } catch {
          logBridge(`--> \x1b[35m${req.method}\x1b[0m ${pathname} body: [Raw/Non-JSON] ${body.slice(0, 100)}`);
          addLog('info', `${req.method} ${pathname}`);
          resolve({});
        }
      });
    });

  // Helper to send JSON
  const sendJson = (data: any, status = 200) => {
    const duration = Date.now() - startTime;
    const statusColor = status >= 400 ? '\x1b[31m' : '\x1b[32m';
    const summary = status >= 400 ? JSON.stringify(data) : data?.result ? String(data.result).slice(0, 120) : 'OK';
    logBridge(`<-- ${statusColor}${status}\x1b[0m ${req.method} ${pathname} (${duration}ms) - ${summary}`, status >= 400);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  };

  // The success tail most routes share; failures keep their explicit sendJson calls.
  const sendOk = (result: any, extra: Record<string, unknown> = {}) => sendJson({ success: true, ...result, ...extra });

  return { readBody, sendJson, sendOk };
}
