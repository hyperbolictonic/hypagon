/**
 * Hypagon REST's diagnostics policy: stdout is the JSON-RPC lifeline, so logs go to a file and
 * stderr gets a boot banner only.
 *
 * Why a module: a client that never drains stderr must not be able to wedge the server, and that
 * rule is easier to keep in one place than in each module that wants to report something.
 */
import fs from 'node:fs';
import path from 'node:path';
import { installProcessGuards } from './process-guard.js';

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

/** When to use: every route in this server — boot, each call, and each bridge failure. */
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

installProcessGuards({ log: logWrap });
