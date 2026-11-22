import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { NAVIGATE_TOOLS } from './tools-catalog-navigate.js';
import { OBSERVE_TOOLS } from './tools-catalog-observe.js';
import { MARKS_TOOLS } from './tools-catalog-marks.js';
import { ACTUATE_TOOLS } from './tools-catalog-actuate.js';
import { MEMORY_TOOLS } from './tools-catalog-memory.js';
import { RESEARCH_TOOLS } from './tools-catalog-research.js';
import { WORKSPACE_TOOLS } from './tools-catalog-workspace.js';
import { CAPTURE_TOOLS } from './tools-catalog-capture.js';
import { DESKTOP_TOOLS } from './tools-catalog-desktop.js';
import { CATALOG_ORDER } from './tools-catalog-order.js';

export type { ToolCatalogItem } from './tools-catalog-types.js';

const SEGMENTS = [
  ...NAVIGATE_TOOLS,
  ...OBSERVE_TOOLS,
  ...MARKS_TOOLS,
  ...ACTUATE_TOOLS,
  ...MEMORY_TOOLS,
  ...RESEARCH_TOOLS,
  ...WORKSPACE_TOOLS,
  ...CAPTURE_TOOLS,
  ...DESKTOP_TOOLS,
];

const byName = new Map(SEGMENTS.map((tool) => [tool.name, tool]));
const pinned = new Set(CATALOG_ORDER);

export const TOOLS_CATALOG: ToolCatalogItem[] = CATALOG_ORDER.map((name) => {
  const tool = byName.get(name);
  if (!tool) throw new Error(`Catalog order names an unknown tool: ${name}`);
  return tool;
});
// Entries a future segment adds without pinning keep their segment order.
for (const tool of SEGMENTS) {
  if (!pinned.has(tool.name)) TOOLS_CATALOG.push(tool);
}

const LEGACY_ALIASES: Array<[legacy: string, canonical: string]> = [
  ['get_history', 'browsing_history'],
  ['clear_history', 'browsing_history_clear'],
  ['recall_script', 'list_scripts'],
  ['focus_window', 'set_window_visibility'],
];

for (const [legacy, canonical] of LEGACY_ALIASES) {
  const target = TOOLS_CATALOG.find((t) => t.name === canonical);
  if (target) {
    TOOLS_CATALOG.push({ ...target, name: legacy, hidden: true, deprecatedInFavorOf: canonical });
  }
}

/**
 * Discoverability tiers (docs/TOOL_CATALOG_REVIEW.md §3, Phase 4).
 *
 * Only tools that have a preferred alternative are tiered — a tool that is the only
 * way to do its job is left unprefixed (no false "tier" noise). `bridge-server.ts`
 * renders the label as a description prefix so the guidance travels with every entry
 * in `tools/list`, for any agent framework.
 */
export const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: 'TIER 1 · prefer',
  2: 'TIER 2 · fallback',
  3: 'TIER 3 · use deliberately',
};

export const TOOL_TIERS: Record<string, 1 | 2 | 3> = {
  navigate_to: 1,
  // TIER 1 — first choice for the job.
  observe: 1,
  act: 1,
  wait_for: 1,
  expect: 1,
  find: 1,
  extract: 1,
  collect_all: 1,
  page_state: 1,
  diff: 1,
  // JEV page reading (preferred when enabled + decision model configured).
  jev_index: 1,
  read_section: 1,
  search_page: 1,
  // TIER 2 — fallbacks when the preferred path cannot do it.
  take_screenshot: 2,
  snapshot_rendered_page: 2,
  press_key: 2,
  // TIER 3 — a powerful tool, not a last resort: reach for it deliberately
  // (prefer the primitives when they fit; injected JS is a bot-detection signal).
  evaluate_javascript: 3,
};

/**
 * Curated default order for `tools/list` and the Settings -> Tools list.
 * Keep the first block in the Golden Operational Sequence: navigate -> observe ->
 * act -> wait -> find -> extract. Tools absent here fall back to catalog order.
 */
export const DEFAULT_TOOL_ORDER: string[] = [
  'navigate',
  'observe',
  'act',
  'wait_for',
  'find',
  'extract',
  'capture',
  'evaluate_javascript',
  'devtools',
  'human_in_loop',
  'collaborate',
  'browser_workspace',
  'shadow_iframes',
  'research',
  'memory',
  'recipe',
  'help',
  // Hidden aliases remain ordered for stateful clients that call them by name.
  'navigate_to',
  'navigate_history',
  'dismiss_consent',
  'scroll_page',
  'collect_all',
  'expect',
  'page_state',
  'diff',
  'take_screenshot',
  'snapshot_rendered_page',
  'press_key',
  'fill_form',
  'browser_zoom',
  'browser_viewport',
  'new_tab',
  'switch_tab',
  'list_tabs',
  'close_tab',
  'get_console_logs',
  'get_fingerprint_profile',
  'recall_memory',
  'browsing_history',
  'browsing_history_clear',
  'add_bookmark',
  'list_bookmarks',
  'delete_bookmark',
  'read_url',
  'search_web',
  'llm_surface',
  'llm_fetch',
  'deep_crawl',
  'research_topic',
  'relocate_citation',
  'revalidate_citations',
  'prerender_links',
  'get_network_traffic',
  'query_json_data',
  'list_realtime_streams',
  'clear_capture',
  'save_script',
  'run_script',
  'list_scripts',
  'delete_script',
  'list_downloads',
  'read_download',
  'record_start',
  'record_stop',
  'list_recordings',
  'request_human_intervention',
  'get_human_activity',
  'get_human_intervention_status',
  'resolve_human_intervention',
  'send_notification',
  'set_window_visibility',
  'configure_system_tray',
  'drive',
  'decide',
  'frames',
  'focus_walk',
  'bridge_health',
  'export_har',
  'context_save',
  'context_open',
  'context_list',
  'context_delete',
];
