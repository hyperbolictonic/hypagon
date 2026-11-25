/**
 * Consolidated MCP surface: the derived views over the group table.
 *
 * The table itself lives in `tool-groups-data.ts`; this module owns the
 * behaviour that reads it — the advertised/hidden name sets and the action
 * lookup the group dispatcher uses.
 */

export { TOOL_GROUPS } from './tool-groups-data.js';
export type { ToolArgs, ToolGroupAction, ToolGroupDefinition } from './tool-groups-data.js';

import { TOOL_GROUPS } from './tool-groups-data.js';

/** When to use: `tools/list` — the names of the meta-tools that front the grouped catalog. */
export const META_TOOL_NAMES = new Set(TOOL_GROUPS.map((group) => group.name));
/** When to use: hiding the individual tools a meta-tool fronts, so only one surface is advertised. */
export const CONSOLIDATED_GROUPED_TOOLS = new Set(
  TOOL_GROUPS.flatMap((group) => group.actions.map((action) => action.tool)),
);
/** `collect_all` is folded into `extract`; old callers can still use it by name. */
export const CONSOLIDATED_HIDDEN_TOOLS = new Set([
  ...CONSOLIDATED_GROUPED_TOOLS,
  'collect_all',
  'expect',
  'press_key',
  'fill_form',
  'recipe',
]);

/** When to use: dispatching a meta-tool call — look up its action entry by name. */
export function groupAction(
  group: import('./tool-groups-data.js').ToolGroupDefinition,
  action: string,
): import('./tool-groups-data.js').ToolGroupAction | undefined {
  return group.actions.find((entry) => entry.action === action);
}
