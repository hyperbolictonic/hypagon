/**
 * The server-level surface: the built-in `help` tool, and the two request
 * interceptors that reshape tools/list and normalize tools/call arguments.
 *
 * Why a module: these are not tools — they are the server's own affordances. They
 * sat in the middle of `createBridgeMcpServer`, which should read as "probe, plan,
 * register".
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CONSOLIDATED_HIDDEN_TOOLS } from './tool-groups.js';
import { HELP_CATEGORIES } from './help-content.js';
import { normalizeIncomingParams } from './normalize-params.js';
import { buildSkillGuide, type SkillGuideFlags } from './skill-guide.js';
import { byConfiguredRank } from '../main/tools/tool-order.js';
import { withGuaranteedToolSchema } from './tool-schema.js';

/** When to use: `createBridgeMcpServer` — register the `help` tool. */
export function registerHelpTool(server: McpServer, flags: SkillGuideFlags): void {
  server.tool(
    'help',
    'Returns a categorized guide, cheatsheet, and workflow tips for all available Hypagon Browser MCP tools (served directly in OKF).',
    {
      category: z
        .enum([
          'all',
          'recommended',
          'navigation',
          'interaction',
          'primitives',
          'inspection',
          'tabs',
          'memory',
          'macros',
          'network',
          'system',
          'skills',
        ])
        .optional()
        .default('all')
        .describe('Optional category to filter help'),
    },
    async ({ category }) => {
      if (category && category !== 'all') {
        return { content: [{ type: 'text', text: HELP_CATEGORIES[category] || 'Category not found.' }] };
      }
      return { content: [{ type: 'text', text: buildSkillGuide(flags) }] };
    },
  );
}

/** When to use: `createBridgeMcpServer` — what the interceptors report through. */
export interface ToolSurfaceDeps {
  /** The advertised order, for the tools/list sort. */
  surfaceOrder: string[];
  /** Deprecated name -> canonical replacement, for the call nudge. */
  hiddenTools: Map<string, string | undefined>;
  log: (message: string, level?: 'boot' | 'call') => void;
  /** A one-line, length-capped rendering of the arguments. */
  preview: (value: unknown) => string;
}

/**
 * When to use: `createBridgeMcpServer` — install the tools/list and tools/call
 * interceptors. List drops deprecated aliases (still callable) and guarantees a
 * schema; call normalizes loose arguments and nudges callers off old names.
 */
export function installToolSurface(server: McpServer, deps: ToolSurfaceDeps): void {
  const rawListHandler = (server as any).server?._requestHandlers?.get?.('tools/list');
  if (rawListHandler) {
    (server as any).server._requestHandlers.set('tools/list', async (request: any, extra: any) => {
      const result = await rawListHandler(request, extra);
      if (result && Array.isArray(result.tools)) {
        const surfaceRank = new Map(deps.surfaceOrder.map((name, index) => [name, index]));
        const visible = result.tools
          .filter((t: any) => !deps.hiddenTools.has(t.name) && !CONSOLIDATED_HIDDEN_TOOLS.has(t.name))
          .sort(byConfiguredRank(surfaceRank, (a: any, b: any) => a.name.localeCompare(b.name)));
        result.tools = visible.map((t: any) => withGuaranteedToolSchema(t));
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
        deps.log(`tools/call: "${request.params.name}" args: ${deps.preview(request.params.arguments)}`);
      }
      const result = await rawCallHandler(request, extra);
      // Nudge callers off deprecated names without breaking them.
      const canonical = deps.hiddenTools.get(request?.params?.name);
      if (canonical && result?.content?.[0]?.type === 'text') {
        deps.log(`[Deprecated] "${request.params.name}" called; canonical is "${canonical}".`);
        result.content[0].text = `⚠ deprecated tool name — use "${canonical}".\n\n${result.content[0].text}`;
      }
      return result;
    });
  }
}
