/**
 * The bridge's log sink.
 *
 * Why a module: the request context and the server lifecycle both log through
 * the same timestamped console+file sink, and the body logger must redact
 * credentials before they reach that file. Keeping the sink here means the
 * bridge file owns transport only, and there is exactly one place that knows
 * where `http-bridge.log` lives.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../data-paths.js';

/** Write one bridge line to the console and to `data/logs/http-bridge.log`. */
export function logBridge(message: string, isError = false) {
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
export function redactLogValue(value: any, depth = 0): any {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => redactLogValue(entry, depth + 1));
  const out: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    out[key] = SECRET_LOG_KEYS.has(key.toLowerCase()) ? '<redacted>' : redactLogValue(entry, depth + 1);
  }
  return out;
}
