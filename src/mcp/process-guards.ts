/**
 * Process guards shared by the stdio MCP servers.
 *
 * A closed stdout pipe (EPIPE) used to arrive as an unhandled `error` event and crash the
 * server, which makes the client drop the whole tool namespace. A closed stdin should exit
 * rather than linger as an orphan competing for the single browser session. Stray async errors
 * are logged and survived, because these servers are stateless forwarders.
 *
 * When to use: once at module load in every stdio server, with its own log/shutdown functions.
 */

/** When to use: supplying a server's diagnostics and shutdown behaviour to the guards. */
export interface ProcessGuardHooks {
  log(message: string, level?: 'boot' | 'call' | 'error'): void;
  shutdown(reason: string): void;
  /** Flush buffered logs when the process exits (optional). */
  onExit?: () => void;
}

/** When to use: at the top of a stdio server module. */
export function installProcessGuards(hooks: ProcessGuardHooks): void {
  let stdoutClosed = false;
  process.stdout.on('error', (err: any) => {
    if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') {
      if (!stdoutClosed) {
        stdoutClosed = true;
        hooks.log('stdout pipe closed by client (EPIPE); shutting down cleanly.', 'boot');
      }
      process.exit(0);
    }
    hooks.log(`stdout stream error: ${err?.message || err}`, 'error');
  });
  process.stderr.on('error', () => {
    // Never let logging throw.
  });

  if (hooks.onExit) process.on('exit', () => hooks.onExit!());

  process.stdin.on('end', () => hooks.shutdown('stdin closed by client; shutting down cleanly.'));
  process.stdin.on('close', () => hooks.shutdown('stdin stream closed; shutting down cleanly.'));

  // Keep the namespace alive on stray async errors. These servers are stateless HTTP
  // forwarders, so continuing after a rejection is safe and far better than vanishing
  // mid-session.
  process.on('unhandledRejection', (reason: any) => {
    hooks.log(`Unhandled promise rejection (server kept alive): ${reason?.stack || reason}`, 'error');
  });
  process.on('uncaughtException', (err: any) => {
    hooks.log(`Uncaught exception (server kept alive): ${err?.stack || err}`, 'error');
  });
}
