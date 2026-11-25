/**
 * Shared stdio entrypoint for the MCP servers.
 *
 * Each server repeats the same boot/fatal envelope: create the MCP server,
 * connect a `StdioServerTransport`, log the handshake and exit non-zero with a
 * labelled fatal message. The bridge adds transport interceptors; the callback
 * keeps that difference local to its entrypoint.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/** Hooks for the shared stdio boot envelope. */
export interface StdioServerHooks {
  /** Human label used in the boot and fatal messages. */
  label: string;
  /** Build the MCP server instance. */
  create(): Promise<{ connect(transport: StdioServerTransport): Promise<void> }>;
  log(message: string, level: 'boot' | 'error'): void;
  /** Flush buffered logs before a fatal exit. */
  flush?(): void;
  /** Install transport-level interceptors before connecting. */
  intercept?(transport: StdioServerTransport): void;
}

/** Boot a stdio MCP server and exit non-zero on a fatal startup error. */
export async function startStdioServer(hooks: StdioServerHooks): Promise<void> {
  try {
    hooks.log(`Initializing ${hooks.label} over stdio...`, 'boot');
    const server = await hooks.create();
    const transport = new StdioServerTransport();
    hooks.intercept?.(transport);
    await server.connect(transport);
    hooks.log('Connected to stdio transport. Listening for JSON-RPC messages.', 'boot');
  } catch (err: any) {
    hooks.log(`Fatal ${hooks.label} Error: ${err?.stack || err}`, 'error');
    hooks.flush?.();
    process.exit(1);
  }
}
