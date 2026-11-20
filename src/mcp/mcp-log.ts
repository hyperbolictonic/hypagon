/**
 * Diagnostics for the browser MCP server.
 *
 * stdout is the JSON-RPC lifeline, so logs are queued to a file and only boot/error lines reach
 * stderr (with a hard byte cap). A client that never drains stderr must not wedge the server.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BRAND } from '../shared/brand.js';

/** When to use: addressing the local Cyberdeck bridge from every MCP tool. */
export const BRIDGE_URL = process.env.HB_BRIDGE_URL || process.env.KUANG_BRIDGE_URL || 'http://127.0.0.1:4111';

// --- Diagnostics policy ------------------------------------------------------
// stdout is the JSON-RPC lifeline; stderr is diagnostics only. A client that
// pipes stderr but never drains it fills the OS pipe buffer and wedges the
// child. This server used to write ~500 bytes per tool call to stderr, so a
// normal browsing turn (~125 calls) was enough to kill the whole namespace.
// See docs/HANDOFF_ORCHA_MCP_STDERR.md.
//
//   - the file log is always written, asynchronously and memory-bounded;
//   - stderr gets a short boot banner by default and nothing per call;
//   - verbose stderr is opt-in and is backpressure-aware (lines are dropped,
//     never queued) plus hard-capped, so it can never wedge the process.
//
// Env: KUANG_MCP_LOG=0 (no file log), KUANG_MCP_STDERR=0 (no stderr),
//      KUANG_MCP_STDERR=verbose (per-call stderr, debugging only).
const LOG_TO_FILE = (process.env.HB_MCP_LOG ?? process.env.KUANG_MCP_LOG) !== '0';
const STDERR_MODE: 'off' | 'boot' | 'verbose' =
  (process.env.HB_MCP_STDERR ?? process.env.KUANG_MCP_STDERR) === '0'
    ? 'off'
    : (process.env.HB_MCP_STDERR ?? process.env.KUANG_MCP_STDERR) === 'verbose'
      ? 'verbose'
      : 'boot';
const STDERR_HARD_CAP_BYTES = 16 * 1024;

const LOG_DIR = path.resolve(process.cwd(), 'data', 'logs');
let logDirReady = false;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  logDirReady = true;
} catch {
  // Logging is best-effort; never fail startup because of it.
}

let logQueue: string[] = [];
let logFlushing = false;
const LOG_QUEUE_MAX_LINES = 2000;

function flushLogQueue(): void {
  if (!LOG_TO_FILE || !logDirReady || logFlushing || logQueue.length === 0) return;
  logFlushing = true;
  const batch = logQueue.join('');
  logQueue = [];
  fs.appendFile(path.join(LOG_DIR, 'mcp-server.log'), batch, () => {
    logFlushing = false;
    if (logQueue.length > 0) flushLogQueue();
  });
}

/** Synchronous drain used only on shutdown paths, where async I/O cannot run. */
export function flushLogSync(): void {
  if (!LOG_TO_FILE || !logDirReady || logQueue.length === 0) return;
  const batch = logQueue.join('');
  logQueue = [];
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'mcp-server.log'), batch);
  } catch {
    // Ignore.
  }
}

let stderrBytesWritten = 0;
let stderrBlocked = false;

/** Bounded, non-queuing stderr write. Dropped lines are intentional. */
function writeStderr(text: string): void {
  if (STDERR_MODE === 'off' || stderrBlocked) return;
  if (stderrBytesWritten >= STDERR_HARD_CAP_BYTES) return;
  const chunk = text.endsWith('\n') ? text : `${text}\n`;
  try {
    const accepted = process.stderr.write(chunk);
    stderrBytesWritten += Buffer.byteLength(chunk);
    if (!accepted) {
      // The consumer is not reading. Stop writing instead of buffering.
      stderrBlocked = true;
      process.stderr.once('drain', () => {
        stderrBlocked = false;
      });
    }
  } catch {
    stderrBlocked = true;
  }
}

type LogLevel = 'boot' | 'call' | 'error';

/** When to use: logging an argument or response body without flooding the log. */
export function preview(value: unknown, max = 2000): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** When to use: writing a line to the MCP stderr log (never stdout). */
export function logMcp(message: string, level: LogLevel = 'call'): void {
  const timestamp = new Date().toISOString();
  if (LOG_TO_FILE) {
    if (logQueue.length >= LOG_QUEUE_MAX_LINES) logQueue.shift();
    logQueue.push(`[${timestamp}] ${message}\n`);
    flushLogQueue();
  }
  if (STDERR_MODE === 'verbose' || (STDERR_MODE === 'boot' && level !== 'call')) {
    writeStderr(`[${BRAND.browser} MCP ${timestamp}] ${message}`);
  }
}
