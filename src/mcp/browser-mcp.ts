/**
 * Hypagon Browser MCP server — the stdio surface in front of the Cyberdeck bridge.
 *
 * This module assembles the server: it decides which catalog tools and action groups are
 * registered (tier order, hidden aliases, recording/decision/JEV gates), then hands the surface
 * to the guide, resources, help and interceptor modules. Bridge access and result shaping live
 * in `browser-surface.ts`, argument normalisation in `browser-params.ts`, and diagnostics in
 * `mcp-log.ts`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { APP_VERSION } from '../shared/version.js';
import { DEFAULT_TOOL_ORDER, TOOLS_CATALOG, TOOL_TIERS, TIER_LABELS } from './tools-catalog.js';
import { TOOL_GROUPS, type ToolGroupDefinition } from './tool-groups.js';
import { decisionStatus } from '../main/decide/decision-client.js';
import { compareByRank } from '../shared/tool-settings.js';
import { logMcp } from './mcp-log.js';
import {
  RECORDING_TOOL_NAMES,
  callBridge,
  executeCatalogTool,
  recordingToolsAllowed,
} from './browser-surface.js';
import { loadToolPreferences, type ToolPreferences } from './tool-preferences.js';
import { okfSkillGuide } from './browser-guide.js';
import { registerResources } from './browser-resources.js';
import { registerHelpTool } from './browser-help.js';
import { installSurfaceInterceptors } from './browser-interceptors.js';

export { flushLogSync, logMcp } from './mcp-log.js';
export { normalizeIncomingParams } from './browser-params.js';

function registerToolGroup(server: McpServer, group: ToolGroupDefinition, preferences: ToolPreferences): void {
  const actions = group.actions.map((action) => action.action) as [string, ...string[]];
  const actionList = group.actions
    .map((action) => {
      const custom = preferences.actionInstructions?.[group.name]?.[action.action];
      return `${action.action} (${custom || action.description})`;
    })
    .join('; ');
  const tier = group.tier;
  const prefix = tier ? `[${TIER_LABELS[tier]}] ` : '';
  server.registerTool(
    group.name,
    {
      description: `${prefix}${group.description} Actions: ${actionList}`,
      inputSchema: z.object({ action: z.enum(actions) }).passthrough(),
    },
    async (args: any): Promise<any> => {
      const action = group.actions.find((entry) => entry.action === args?.action);
      if (!action) {
        return { isError: true, content: [{ type: 'text', text: `Unknown action "${args?.action}". Use one of: ${group.actions.map((entry) => entry.action).join(', ')}` }] };
      }
      const { action: _action, ...rest } = args || {};
      const mapped = action.map ? action.map(rest) : rest;
      if (action.endpoint) {
        try {
          const data = await callBridge(action.endpoint, action.method || 'POST', mapped);
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: 'text', text: `[Hypagon Browser MCP Error] ${error?.message || error}` }],
          };
        }
      }
      const target = TOOLS_CATALOG.find((tool) => tool.name === action.tool);
      if (!target) {
        return { isError: true, content: [{ type: 'text', text: `Action "${action.action}" is unavailable.` }] };
      }
      return executeCatalogTool(target, mapped);
    },
  );
}

/** When to use: one catalog tool's advertised description (tier, overrides, JEV guidance). */
function describeTool(
  tool: (typeof TOOLS_CATALOG)[number],
  preferences: ToolPreferences,
  jevActive: boolean,
  jevEnforced: boolean,
): string {
  const tier = TOOL_TIERS[tool.name];
  let details = preferences.instructions[tool.name] || tool.description;
  if (jevActive) {
    // Guidance has to travel with the description: most clients show tools/list text, not resources.
    if (tool.name === 'jev_index') {
      details = `${jevEnforced ? 'MANDATORY READING PATH (JEV ENFORCED)' : 'PREFERRED READING PATH'} — call this first for the active page. ${details}`;
    } else if (tool.name === 'observe') {
      details += jevEnforced
        ? ' JEV ENFORCED: unscoped markdown/text reads are REFUSED with code JEV_REQUIRED. Read with jev_index then read_section. as:"markdown" still works when scoped (region) or bounded (budget > 0, cursor), and full:true is the logged bypass.'
        : ' JEV ACTIVE: for page CONTENT prefer jev_index then read_section (a small index plus one section replaces a 10k+ token dump). Use as:"markdown" when you must act on [#ID] marks, or when the page is small.';
    } else if (tool.name === 'decide') {
      details += jevEnforced
        ? ' JEV ENFORCED: unscoped page dumps are refused; read content via jev_index then read_section.'
        : ' JEV ACTIVE: read page content via jev_index then read_section before deciding.';
    }
  }
  const prefix = tool.hidden
    ? `[DEPRECATED → use "${tool.deprecatedInFavorOf || 'the canonical tool'}"] `
    : tier
      ? `[${TIER_LABELS[tier]}] `
      : '';
  return `${prefix}${details}`;
}

/** When to use: booting the stdio MCP server that fronts the bridge. */
export async function createBridgeMcpServer() {
  const server = new McpServer({
    name: 'hb-browser',
    version: APP_VERSION,
  });

  // The recording tools are gated by a human-only switch in Settings → Recording. Probe the
  // bridge once at startup: when the switch is off, they are not registered at all (so they
  // cannot appear in tools/list). The bridge routes refuse them too, which covers sessions
  // that were already connected when the switch was flipped.
  const recordingToolsAvailable = await recordingToolsAllowed();
  if (!recordingToolsAvailable) {
    logMcp('[Recording] Tools are disabled by the human-only switch; not registering them.', 'boot');
  }

  // When a decision model is configured, its tools are the most interesting thing on the surface:
  // register them first so `tools/list` leads with `drive` and `decide` instead of burying them
  // among 59 browser tools. When it is not configured they are not registered at all.
  const decisionConfigured = decisionStatus().configured;
  const toolPreferences = await loadToolPreferences();
  const disabledTools = new Set(toolPreferences.disabled);

  // JEV becomes the preferred reading path only when the human turned it on AND a decision model
  // is configured (the bridge computes that gate). Leading the surface with jev_index/read_section
  // and demoting whole-page dumps is what makes "prefer the index" stick in practice.
  const JEV_TOOL_NAMES = ['jev_index', 'read_section', 'search_page'];
  const jevActive = decisionConfigured && toolPreferences.jevAvailable;
  const jevEnforced = jevActive && toolPreferences.jevMode === 'enforce';
  const lead = [...(decisionConfigured ? ['drive', 'decide'] : []), ...(jevActive ? JEV_TOOL_NAMES : [])];
  const surfaceOrder = [...lead, ...DEFAULT_TOOL_ORDER.filter((name) => !lead.includes(name))];
  const baseTools = lead.length
    ? [
        ...TOOLS_CATALOG.filter((t) => lead.includes(t.name)),
        ...TOOLS_CATALOG.filter((t) => !lead.includes(t.name)),
      ]
    : TOOLS_CATALOG;
  const defaultOrder = surfaceOrder;
  const baseRank = new Map(defaultOrder.map((name, index) => [name, index]));
  const configuredRank = new Map(toolPreferences.order.map((name, index) => [name, index]));
  const orderedTools = baseTools
    .filter((tool) => !disabledTools.has(tool.name))
    .sort((a, b) =>
      compareByRank(
        a.name,
        b.name,
        configuredRank,
        (aName, bName) =>
          (baseRank.get(aName) ?? Number.MAX_SAFE_INTEGER) - (baseRank.get(bName) ?? Number.MAX_SAFE_INTEGER),
      ),
    );

  for (const tool of orderedTools) {
    // The decision model is opt-in: when no backend is configured, `decide`/`drive` are not
    // registered at all (so they cannot appear in tools/list and cannot be called by name). The
    // bridge routes still exist and answer NOT_CONFIGURED with setup instructions.
    if ((tool.name === 'decide' || tool.name === 'drive') && !decisionConfigured) continue;
    // Same economics for JEV: the three tool schemas cost ~1k tokens per request, so an
    // unavailable feature must not appear in (and bill for) every prompt.
    if (JEV_TOOL_NAMES.includes(tool.name) && !toolPreferences.jevAvailable) continue;
    if (!recordingToolsAvailable && RECORDING_TOOL_NAMES.has(tool.name)) continue;

    // Phase 4: fold discoverability guidance into the advertised description so it
    // travels with every tools/list entry in any agent framework.
    server.tool(tool.name, describeTool(tool, toolPreferences, jevActive, jevEnforced), tool.parameters, async (args: any): Promise<any> =>
      executeCatalogTool(tool, args),
    );
  }

  for (const group of TOOL_GROUPS) {
    if (disabledTools.has(group.name)) continue;
    registerToolGroup(server, group, toolPreferences);
  }

  const guide = okfSkillGuide(jevActive, jevEnforced);
  registerResources(server, guide);
  registerHelpTool(server, guide);
  installSurfaceInterceptors(server, surfaceOrder);

  return server;
}
