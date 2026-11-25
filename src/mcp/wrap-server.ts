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
 * declared arguments (S4), capped at 40 and refreshed with `tools/list_changed` whenever
 * the wrapper set changes.
 *
 * Why this file is small: `wrap-config.ts` reads the environment, `wrap-bridge.ts` is the
 * one bridge call, `wrap-format.ts` renders payloads, `wrap-tool-result.ts` is the tool-call
 * envelope, `wrap-tools.ts` registers the ten meta-tools, `wrap-generated-tools.ts`
 * reconciles the generated tools and `wrap-log.ts` is the diagnostics policy. This module
 * builds the server, registers, reconciles and serves.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { startStdioServer } from './stdio-server.js';
import { APP_VERSION } from '../shared/version.js';
import { GeneratedTools } from './wrap-generated-tools.js';
import { logWrap } from './wrap-log.js';
import { registerWrapTools } from './wrap-tools.js';

/** When to use: the hb-rest stdio entry point — build the wrapper MCP server and register its tools. */
export async function createWrapMcpServer() {
  const server = new McpServer({
    name: 'hb-rest',
    version: APP_VERSION,
  });

  const generated = new GeneratedTools(server);
  registerWrapTools(server, generated);

  // Register the generated tools that already qualify (S4). Best-effort: a missing
  // bridge just means no generated tools until the next wrapper mutation.
  await generated.sync();

  return server;
}

void startStdioServer({
  label: 'Hypagon REST MCP Server',
  create: createWrapMcpServer,
  log: logWrap,
});
