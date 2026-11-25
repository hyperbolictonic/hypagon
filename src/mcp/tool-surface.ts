/**
 * What the server advertises: the tool order, the descriptions, and which tools are
 * registered at all.
 *
 * Why a module: the ordering rules are policy — a configured decision model leads
 * the surface, an active JEV leads the reading path, deprecated names stay callable
 * but hidden. `createBridgeMcpServer` should read as "probe, plan, register".
 */
import {
  DEFAULT_TOOL_ORDER,
  TIER_LABELS,
  TOOL_TIERS,
  TOOLS_CATALOG,
  type ToolCatalogItem,
} from './tools-catalog.js';
import { byConfiguredRank } from '../main/tools/tool-order.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** The persisted tool surface, as the bridge reports it. */
export interface ToolPreferences {
  order: string[];
  disabled: string[];
  instructions: Record<string, string>;
  actionInstructions: Record<string, Record<string, string>>;
  /** JEV is enabled AND a decision model is configured (bridge-computed). */
  jevAvailable: boolean;
  /** 'enforce' refuses unscoped page dumps; 'prefer' only steers. */
  jevMode: 'prefer' | 'enforce';
}

/** The reading-path tools whose placement and registration follow JEV. */
export const JEV_TOOL_NAMES = ['jev_index', 'read_section', 'search_page'];

/** When to use: the human-only recording switch — these are absent when it is off. */
export const RECORDING_TOOL_NAMES = new Set(['record_start', 'record_stop', 'list_recordings']);

/** When to use: `registerCatalogTools` — everything the registry needs per call. */
export interface ToolSurfacePlan {
  /** The tools to register, in surface order. */
  orderedTools: ToolCatalogItem[];
  /** Tool-group names the human turned off. */
  disabledTools: Set<string>;
  /** The advertised order, for the tools/list filter. */
  surfaceOrder: string[];
  jevActive: boolean;
  jevEnforced: boolean;
  /** Whether a decision model is configured (decide/drive are registered only then). */
  decisionConfigured: boolean;
  /** Deprecated name -> its canonical replacement, for the call nudge. */
  hiddenTools: Map<string, string | undefined>;
}

/** When to use: `createBridgeMcpServer` — decide what the surface should be. */
export function planToolSurface(preferences: ToolPreferences, decisionConfigured: boolean): ToolSurfacePlan {
  const disabledTools = new Set(preferences.disabled);

  // JEV becomes the preferred reading path only when the human turned it on AND a decision model
  // is configured (the bridge computes that gate). Leading the surface with jev_index/read_section
  // and demoting whole-page dumps is what makes "prefer the index" stick in practice.
  const jevActive = decisionConfigured && preferences.jevAvailable;
  const jevEnforced = jevActive && preferences.jevMode === 'enforce';
  const lead = [...(decisionConfigured ? ['drive', 'decide'] : []), ...(jevActive ? JEV_TOOL_NAMES : [])];
  const surfaceOrder = [...lead, ...DEFAULT_TOOL_ORDER.filter((name) => !lead.includes(name))];
  const baseTools = lead.length
    ? [...TOOLS_CATALOG.filter((t) => lead.includes(t.name)), ...TOOLS_CATALOG.filter((t) => !lead.includes(t.name))]
    : TOOLS_CATALOG;
  const baseRank = new Map(surfaceOrder.map((name, index) => [name, index]));
  const configuredRank = new Map(preferences.order.map((name, index) => [name, index]));
  const orderedTools = baseTools
    .filter((tool) => !disabledTools.has(tool.name))
    .sort(
      byConfiguredRank(configuredRank, (a, b) =>
        (baseRank.get(a.name) ?? Number.MAX_SAFE_INTEGER) - (baseRank.get(b.name) ?? Number.MAX_SAFE_INTEGER),
      ),
    );

  const hiddenTools = new Map(
    TOOLS_CATALOG.filter((t) => t.hidden).map((t) => [t.name, t.deprecatedInFavorOf] as const),
  );

  return { orderedTools, disabledTools, surfaceOrder, jevActive, jevEnforced, decisionConfigured, hiddenTools };
}

/**
 * When to use: `registerCatalogTools` — the advertised description for one tool.
 *
 * Phase 4: discoverability guidance is folded into the description so it travels
 * with every tools/list entry in any agent framework.
 */
export function describeTool(tool: ToolCatalogItem, preferences: ToolPreferences, plan: ToolSurfacePlan): string {
  const tier = TOOL_TIERS[tool.name];
  let details = preferences.instructions[tool.name] || tool.description;
  if (plan.jevActive) {
    // Guidance has to travel with the description: most clients show tools/list text, not resources.
    if (tool.name === 'jev_index') {
      details = `${plan.jevEnforced ? 'MANDATORY READING PATH (JEV ENFORCED)' : 'PREFERRED READING PATH'} — call this first for the active page. ${details}`;
    } else if (tool.name === 'observe') {
      details += plan.jevEnforced
        ? ' JEV ENFORCED: unscoped markdown/text reads are REFUSED with code JEV_REQUIRED. Read with jev_index then read_section. as:"markdown" still works when scoped (region) or bounded (budget > 0, cursor), and full:true is the logged bypass.'
        : ' JEV ACTIVE: for page CONTENT prefer jev_index then read_section (a small index plus one section replaces a 10k+ token dump). Use as:"markdown" when you must act on [#ID] marks, or when the page is small.';
    } else if (tool.name === 'decide') {
      details += plan.jevEnforced
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

/** When to use: `createBridgeMcpServer` — register the advertised catalogue. */
export function registerCatalogTools(
  server: McpServer,
  plan: ToolSurfacePlan,
  preferences: ToolPreferences,
  options: { recordingToolsAvailable: boolean; execute: (tool: ToolCatalogItem, args: any) => Promise<any> },
): void {
  for (const tool of plan.orderedTools) {
    // The decision model is opt-in: when no backend is configured, `decide`/`drive` are not
    // registered at all (so they cannot appear in tools/list and cannot be called by name). The
    // bridge routes still exist and answer NOT_CONFIGURED with setup instructions.
    if ((tool.name === 'decide' || tool.name === 'drive') && !plan.decisionConfigured) continue;
    // Same economics for JEV: the three tool schemas cost ~1k tokens per request, so an
    // unavailable feature must not appear in (and bill for) every prompt.
    if (JEV_TOOL_NAMES.includes(tool.name) && !preferences.jevAvailable) continue;
    if (!options.recordingToolsAvailable && RECORDING_TOOL_NAMES.has(tool.name)) continue;

    server.tool(tool.name, describeTool(tool, preferences, plan), tool.parameters, async (args: any): Promise<any> =>
      options.execute(tool, args),
    );
  }
}
