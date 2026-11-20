/**
 * Request-level interceptors on the MCP server.
 *
 * tools/list is enriched for every agent framework (hidden aliases filtered, schemas copied to
 * the four field names clients expect, order applied); tools/call normalises caller arguments
 * before validation and flags deprecated names without breaking them.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CONSOLIDATED_HIDDEN_TOOLS } from './tool-groups.js';
import { TOOLS_CATALOG } from './tools-catalog.js';
import { collectActionInstructions, compareByRank } from '../shared/tool-settings.js';
import { logMcp, preview } from './mcp-log.js';
import { normalizeIncomingParams } from './browser-params.js';
import { withSchemaAliases } from './tool-schema-surface.js';

/** When to use: once at boot, after the tools are registered. */
export function installSurfaceInterceptors(server: McpServer, surfaceOrder: string[]): void {
  // Intercept tools/list to enrich each tool definition for ANY agent framework or chatbot.
  // Deprecated aliases (TOOLS_CATALOG[].hidden) are filtered out of the advertised surface but
  // remain registered, so they can still be invoked by name via tools/call.
  const HIDDEN_TOOLS = new Map(
    TOOLS_CATALOG.filter((t) => t.hidden).map((t) => [t.name, t.deprecatedInFavorOf] as const)
  );
  const rawListHandler = (server as any).server?._requestHandlers?.get?.('tools/list');
  if (rawListHandler) {
    (server as any).server._requestHandlers.set('tools/list', async (request: any, extra: any) => {
      const result = await rawListHandler(request, extra);
      if (result && Array.isArray(result.tools)) {
        const surfaceRank = new Map(surfaceOrder.map((name, index) => [name, index]));
        const visible = result.tools
          .filter((t: any) => !HIDDEN_TOOLS.has(t.name) && !CONSOLIDATED_HIDDEN_TOOLS.has(t.name))
          .sort((a: any, b: any) => compareByRank(a.name, b.name, surfaceRank, (aName, bName) => aName.localeCompare(bName)));
        result.tools = visible.map(withSchemaAliases);
      }
      return result;
    });
  }

  // Install universal request-level argument normalizer on underlying MCP Server
  const rawCallHandler = (server as any).server?._requestHandlers?.get?.('tools/call');
  if (rawCallHandler) {
    (server as any).server._requestHandlers.set('tools/call', async (request: any, extra: any) => {
      if (request?.params) {
        request.params.arguments = normalizeIncomingParams(request.params);
        logMcp(`tools/call: "${request.params.name}" args: ${preview(request.params.arguments)}`);
      }
      const result = await rawCallHandler(request, extra);
      // Nudge callers off deprecated names without breaking them.
      const canonical = HIDDEN_TOOLS.get(request?.params?.name);
      if (canonical && result?.content?.[0]?.type === 'text') {
        logMcp(`[Deprecated] "${request.params.name}" called; canonical is "${canonical}".`);
        result.content[0].text = `⚠ deprecated tool name — use "${canonical}".\n\n${result.content[0].text}`;
      }
      return result;
    });
  }
}
