/**
 * Diagnostics policy for the Hypagon REST MCP server.
 *
 * stdout is the JSON-RPC lifeline. Diagnostics go to a file; stderr gets a short boot banner
 * only, so a client that never drains stderr cannot wedge the server. The process guards
 * below keep a closed pipe from turning into an unhandled error.
 *
 * When to use: `installProcessGuards()` at boot, and `logWrap` from anywhere in this server.
 */
import fs from 'node:fs';
import path from 'node:path';

const LOG_TO_FILE = (process.env.HB_MCP_LOG ?? process.env.KUANG_MCP_LOG) !== '0';
const STDERR_MODE: 'off' | 'boot' =
  (process.env.HB_MCP_STDERR ?? process.env.KUANG_MCP_STDERR) === '0' ||
  (process.env.HB_WRAP_STDERR ?? process.env.KUANG_WRAP_STDERR) === '0'
    ? 'off'
    : 'boot';
const LOG_DIR = path.resolve(process.cwd(), 'data', 'logs');
let logDirReady = false;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  logDirReady = true;
} catch {
  // Best effort.
}

let stderrBytes = 0;
function writeStderr(text: string): void {
  if (STDERR_MODE === 'off' || stderrBytes >= 8 * 1024) return;
  const chunk = text.endsWith('\n') ? text : `${text}\n`;
  try {
    stderrBytes += Buffer.byteLength(chunk);
    process.stderr.write(chunk);
  } catch {
    // Never let logging throw.
  }
}

/** When to use: one diagnostic line — the file always, stderr only for boot/error. */
export function logWrap(message: string, level: 'boot' | 'call' | 'error' = 'call'): void {
  const timestamp = new Date().toISOString();
  if (LOG_TO_FILE && logDirReady) {
    fs.appendFile(path.join(LOG_DIR, 'wrap-server.log'), `[${timestamp}] ${message}\n`, () => {
      // Best effort.
    });
  }
  if (STDERR_MODE === 'boot' && level !== 'call') {
    writeStderr(`[Hypagon REST ${timestamp}] ${message}`);
  }
}

let shuttingDown = false;

/** When to use: stdin ended or a fatal boot error — log once, then exit 0. */
export function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logWrap(reason, 'boot');
  process.exit(0);
}

