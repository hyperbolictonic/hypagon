/**
 * Hypagon REST — a second stdio MCP server for saved REST wrappers.
 *
 * It is deliberately stateless: every tool call becomes one HTTP request to the
 * Cyberdeck bridge, which owns the wrapper store and the outbound policy. That
 * keeps the MCP process free of secrets, file paths, and browser lifecycle.
 *
 * Agent surface:
 *   wrap_list / wrap_get          what exists
 *   wrap_derive                   infer a first-draft recipe from a sample or URL
 *   wrap_create / wrap_update     save a deterministic request + recipe
 *   wrap_run                      execute with flat semantic arguments
 *   wrap_test                     dry-run or render a sample, without sending
 *   wrap_delete                   remove a wrapper
 *   wrap_reload                   re-read the manifest (compatibility alias)
 *
 * A wrapper with `exposeAsTool: true` also gets a generated `wrap_<id>` tool with its
 * declared arguments (S4), capped and refreshed with `tools/list_changed` whenever the
 * wrapper set changes.
 *
 * The pieces: tool registrations in `wrap-tools.ts`, the generated registry in
 * `wrap-generated.ts`, text shaping in `wrap-format.ts`, the bridge client in
 * `wrap-config.ts`, diagnostics in `wrap-log.ts`, and the shared stdio guards in
 * `process-guards.ts`.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { APP_VERSION } from '../shared/version.js';
import { logWrap, shutdown } from './wrap-log.js';
import { installProcessGuards } from './process-guards.js';
import { createGeneratedTools } from './wrap-generated.js';
import {
  registerAuthoringTools,
  registerDeriveTool,
  registerDiscoveryTools,
  registerExecutionTools,
  registerSecretTools,
} from './wrap-tools.js';

installProcessGuards({ log: logWrap, shutdown });

/** When to use: booting the Hypagon REST MCP server (meta-tools plus generated wrappers). */
export async function createWrapMcpServer() {
  const server = new McpServer({
    name: 'hb-rest',
    version: APP_VERSION,
  });

  const generatedTools = createGeneratedTools(server);

  registerDiscoveryTools(server, generatedTools);
  registerSecretTools(server);
  registerAuthoringTools(server, generatedTools);
  registerDeriveTool(server);
  registerExecutionTools(server);

  // Register the generated tools that already qualify (S4). Best-effort: a missing
  // bridge just means no generated tools until the next wrapper mutation.
  await generatedTools.refresh();

  return server;
}

async function start() {
  logWrap('Initializing Hypagon REST MCP Server over stdio...', 'boot');
  const server = await createWrapMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logWrap('Connected to stdio transport. Listening for JSON-RPC messages.', 'boot');
}

start().catch((err) => {
  logWrap(`Fatal Hypagon REST MCP Server Error: ${err?.stack || err}`, 'error');
  process.exit(1);
});
