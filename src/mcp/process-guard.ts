/**
 * Process resilience shared by the stdio MCP entrypoints.
 *
 * Why: a closed stdout pipe (EPIPE) arrives as an unhandled 'error' on
 * `process.stdout` and used to crash the server, dropping the whole tool
 * namespace; a client closing stdin used to leave an orphan competing for the
 * single browser session. Every stdio server needs the identical guards and
 * differs only in where it logs.
 */

export interface ProcessGuardOptions {
  /** Server logger: 'boot' for lifecycle, 'error' for faults. */
  log: (message: string, level: 'boot' | 'error') => void;
  /** Flush buffered logs before exit, when the logger buffers. */
  flush?: () => void;
}

/**
 * When to use: at the top of a stdio MCP server entrypoint, before connecting
 * the transport. Installs the stdout EPIPE guard, the stdin shutdown pair and
 * the keep-alive handlers.
 */
export function installProcessGuards({ log, flush }: ProcessGuardOptions): void {
  let stdoutClosed = false;
  process.stdout.on('error', (err: any) => {
    if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED') {
      if (!stdoutClosed) {
        stdoutClosed = true;
        log('stdout pipe closed by client (EPIPE); shutting down cleanly.', 'boot');
      }
      process.exit(0);
    }
    log(`stdout stream error: ${err?.message || err}`, 'error');
  });
  process.stderr.on('error', () => { /* never let logging throw */ });

  // Explicit lifecycle: if the client closes our stdin, exit rather than linger
  // as an orphan that keeps competing for the single browser session.
  let shuttingDown = false;
  const shutdown = (reason: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(reason, 'boot');
    flush?.();
    process.exit(0);
  };
  process.stdin.on('end', () => shutdown('stdin closed by client; shutting down cleanly.'));
  process.stdin.on('close', () => shutdown('stdin stream closed; shutting down cleanly.'));
  process.on('exit', () => flush?.());

  // Keep the namespace alive on stray async errors: continuing after a rejection
  // is safer than vanishing mid-session.
  process.on('unhandledRejection', (reason: any) => {
    log(`Unhandled promise rejection (server kept alive): ${reason?.stack || reason}`, 'error');
  });
  process.on('uncaughtException', (err: any) => {
    log(`Uncaught exception (server kept alive): ${err?.stack || err}`, 'error');
  });
}
