/**
 * The bridge's server lifecycle messages.
 *
 * Why a module: both messages are long, operational copy — the "port already in
 * use" diagnosis that names the fix, and the startup banner. Keeping them out of
 * the server factory lets the factory stay transport wiring, and keeps the
 * EADDRINUSE advice in one place for both console and activity log.
 */
import { logBridge } from './bridge-log.js';

type AddLog = (level: 'info' | 'warn' | 'action', message: string) => void;

/** When to use: the server `error` event — explain a port clash instead of a bare EADDRINUSE. */
export function logListenError(port: number, err: any, addLog: AddLog): void {
  const inUse = err?.code === 'EADDRINUSE';
  const message = inUse
    ? `Port ${port} is already in use — another Cyberdeck (dev or installed) is probably running. ` +
      'Only one bridge can own a port: close the other instance, or start this one with ' +
      'HB_BRIDGE_PORT=<other port> and point the MCP server at it with HB_BRIDGE_URL.'
    : `HTTP Bridge server error on port ${port}: ${err?.message || err}`;
  logBridge(message, true);
  addLog('warn', message);
}

/** When to use: the `listen` callback — announce the active gateway in the console and activity log. */
export function announceListening(port: number, addLog: AddLog): void {
  logBridge(`\n======================================================\n 🚀 HYPAGON GATEWAY // CYBERDECK HTTP BRIDGE\n Active at: http://127.0.0.1:${port}\n Live directive logging enabled.\n======================================================\n`);
  addLog('info', `Autonomous Bridge active at http://127.0.0.1:${port}`);
}
