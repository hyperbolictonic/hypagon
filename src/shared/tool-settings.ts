/** Persisted overrides for the advertised browser MCP tool surface. */
export interface ToolSettings {
  schemaVersion: 1;
  /** Global display/registration order. Unknown names are ignored by the server. */
  order: string[];
  /** Canonical advertised tool names hidden from tools/list. */
  disabled: string[];
  /** Per-tool description overrides. An empty value means "use the catalog default". */
  instructions: Record<string, string>;
  /** Per-action instruction overrides for grouped tools: tool -> action -> text. */
  actionInstructions: Record<string, Record<string, string>>;
}

/** When to use: describing one action the tools panel can display. */
export interface ToolManagerAction {
  name: string;
  description: string;
  tool: string;
  instruction: string;
}

/** When to use: rendering one tool row (name, description, state, instructions). */
export interface ToolManagerEntry {
  name: string;
  description: string;
  tier: 1 | 2 | 3 | null;
  tierLabel: string;
  enabled: boolean;
  instruction: string;
  actions?: ToolManagerAction[];
}

/** When to use: reading the tools panel snapshot (order, disabled sets, instructions). */
export interface ToolManagerState {
  tools: ToolManagerEntry[];
  settings: ToolSettings;
}

/** When to use: returning a tools-panel mutation result over IPC. */
export interface ToolManagerResult {
  ok: boolean;
  state?: ToolManagerState;
  errors: string[];
}

/** When to use: ordering tools by a saved rank, then by a caller-provided fallback. */
export function compareByRank(
  aName: string,
  bName: string,
  rank: Map<string, number>,
  fallback: (a: string, b: string) => number,
): number {
  const aRank = rank.get(aName);
  const bRank = rank.get(bName);
  if (aRank !== undefined || bRank !== undefined) {
    if (aRank === undefined) return 1;
    if (bRank === undefined) return -1;
    if (aRank !== bRank) return aRank - bRank;
  }
  return fallback(aName, bName);
}

/**
 * When to use: reading saved per-action instruction text from settings or a tools/list result.
 * The caller decides which (tool, action) pairs are acceptable and how to trim the text.
 */
export function collectActionInstructions(
  source: unknown,
  map: (toolName: string, actionName: string, text: string) => string | null,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const [toolName, rawActions] of Object.entries(source as Record<string, unknown>)) {
    if (!rawActions || typeof rawActions !== 'object' || Array.isArray(rawActions)) continue;
    const actions: Record<string, string> = {};
    for (const [actionName, text] of Object.entries(rawActions as Record<string, unknown>)) {
      if (typeof text !== 'string' || !text.trim()) continue;
      const mapped = map(toolName, actionName, text);
      if (mapped !== null) actions[actionName] = mapped;
    }
    if (Object.keys(actions).length) out[toolName] = actions;
  }
  return out;
}
