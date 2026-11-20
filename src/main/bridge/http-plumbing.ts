/**
 * HTTP plumbing for the local REST bridge.
 *
 * Logging, CORS, body reading and the JSON responder are transport concerns; the
 * bridge shell only sequences policy and route families. Keeping them here means the
 * bridge log format (and its secret redaction) has one owner.
 *
 * When to use: starting the bridge (it wires these), or adding a route that needs the
 * same response/logging contract.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BrowserChassis } from '../browser-chassis.js';
import { dataPath } from '../data-paths.js';

/** When to use: writing one bridge log line to the console and data/logs/http-bridge.log. */
export function logBridge(message: string, isError = false): void {
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

/** When to use: every bridge response — the MCP client is not a browser, so CORS stays open. */
export function setCorsHeaders(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Kuang-Wrap-Token');
}

/** When to use: reading a request body once (the caller memoises the returned reader). */
export function createBodyReader(req: IncomingMessage, chassis: BrowserChassis, pathname: string): () => Promise<any> {
  return () =>
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
}

/** When to use: answering a route — writes the JSON body and the matching log line. */
export function createJsonSender(req: IncomingMessage, res: ServerResponse, pathname: string, startTime: number) {
  return (data: any, status = 200) => {
    const duration = Date.now() - startTime;
    const statusColor = status >= 400 ? '\x1b[31m' : '\x1b[32m';
    const summary = status >= 400 ? JSON.stringify(data) : (data?.result ? String(data.result).slice(0, 120) : 'OK');
    logBridge(`<-- ${statusColor}${status}\x1b[0m ${req.method} ${pathname} (${duration}ms) - ${summary}`, status >= 400);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  };
}
