/**
 * Persisted tool instructions, sanitised.
 *
 * Why a module: the main process validates instructions before saving them (it
 * knows the advertised tool names and each group's actions) and the MCP server
 * sanitises the same payload after reading it from the bridge (it does not).
 * The trim/empty/length rules are identical, so they live here once.
 */

/** When to use: the callers that need an allow-list and/or a length cap. */
/** When to use: the callers that need an allow-list and/or a length cap. */
export interface InstructionLimits {
  /** Trim and drop anything longer than this. Omitted means no cap. */
  maxLength?: number;
  /** Names to keep; omitted means every name is allowed. */
  allow?: ReadonlySet<string>;
}

/** When to use: `actionInstructions` — each tool keeps its own action allow-list. */
export interface ActionInstructionLimits {
  maxLength?: number;
  /** Tools and, per tool, the action names to keep; omitted means everything. */
  allow?: ReadonlyMap<string, ReadonlySet<string>>;
}

/** When to use: `instructions` — a name → text map from persisted settings or the bridge. */
export function normalizeInstructionMap(source: unknown, limits: InstructionLimits = {}): Record<string, string> {
  const out: Record<string, string> = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const [name, raw] of Object.entries(source)) {
    if (limits.allow && !limits.allow.has(name)) continue;
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const text = raw.trim();
    out[name] = limits.maxLength ? text.slice(0, limits.maxLength) : text;
  }
  return out;
}

/** When to use: `actionInstructions` — a tool → action → text map. */
export function normalizeActionInstructions(
  source: unknown,
  limits: ActionInstructionLimits = {},
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return out;
  for (const [toolName, rawActions] of Object.entries(source)) {
    const allowed = limits.allow?.get(toolName);
    if (limits.allow && !allowed) continue;
    const actions = normalizeInstructionMap(rawActions, { maxLength: limits.maxLength, allow: allowed });
    if (Object.keys(actions).length) out[toolName] = actions;
  }
  return out;
}
