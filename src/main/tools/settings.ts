import type { ToolSettings } from '../../shared/tool-settings.js';
import { readJsonFile, writeJsonFileAtomic } from '../settings/json-file.js';

export interface ToolSettingsValidation {
  ok: boolean;
  settings?: ToolSettings;
  errors: string[];
}

export const DEFAULT_TOOL_SETTINGS: ToolSettings = {
  schemaVersion: 1,
  order: [],
  disabled: [],
  instructions: {},
  actionInstructions: {},
};

const MAX_INSTRUCTION_CHARS = 12_000;
const MAX_NAMES = 500;

function cloneDefaults(): ToolSettings {
  return { ...DEFAULT_TOOL_SETTINGS, order: [], disabled: [], instructions: {}, actionInstructions: {} };
}

function uniqueNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (seen.size >= MAX_NAMES) break;
  }
  return [...seen];
}

function normalizeInstructions(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [rawName, rawText] of Object.entries(value)) {
    const name = rawName.trim();
    if (!name || typeof rawText !== 'string') continue;
    const text = rawText.trim();
    if (!text) continue;
    out[name] = text.slice(0, MAX_INSTRUCTION_CHARS);
  }
  return out;
}

function normalizeActionInstructions(value: unknown): Record<string, Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [rawTool, rawActions] of Object.entries(value)) {
    const tool = rawTool.trim();
    if (!tool || !rawActions || typeof rawActions !== 'object' || Array.isArray(rawActions)) continue;
    const actions = normalizeInstructions(rawActions);
    if (Object.keys(actions).length) out[tool] = actions;
  }
  return out;
}

export function normalizeToolSettings(input: unknown): ToolSettingsValidation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['tool settings must be an object'] };
  }
  const source = input as Record<string, unknown>;
  return {
    ok: true,
    errors: [],
    settings: {
      schemaVersion: 1,
      order: uniqueNames(source.order),
      disabled: uniqueNames(source.disabled),
      instructions: normalizeInstructions(source.instructions),
      actionInstructions: normalizeActionInstructions(source.actionInstructions),
    },
  };
}

/** File-backed store. One instance is shared by the IPC handlers and the local bridge. */
export class ToolSettingsStore {
  readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  load(): ToolSettings {
    const parsed = readJsonFile(this.file);
    if (parsed === null) return cloneDefaults();
    const normalized = normalizeToolSettings(parsed);
    return normalized.ok && normalized.settings ? normalized.settings : cloneDefaults();
  }

  save(input: unknown): ToolSettingsValidation {
    const normalized = normalizeToolSettings(input);
    if (!normalized.ok || !normalized.settings) return normalized;
    const written = writeJsonFileAtomic(this.file, normalized.settings);
    if (!written.ok) {
      return { ok: false, errors: [`Could not save tool settings: ${written.error}`] };
    }
    return normalized;
  }

  reset(): ToolSettingsValidation {
    return this.save(cloneDefaults());
  }
}
