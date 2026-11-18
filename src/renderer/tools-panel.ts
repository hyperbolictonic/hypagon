import type { ElectronAPI } from '../preload/index.js';
import type { ToolManagerEntry, ToolManagerState, ToolSettings } from '../shared/tool-settings.js';
import { byId, renderDetail, renderList, type ToolsViewContext } from './tools-panel-view.js';

/**
 * Tools panel controller: state, persistence and events.
 *
 * Rendering lives in tools-panel-view.ts; this module owns the entries/settings
 * snapshot, dirty tracking and the save/reset/preset actions.
 *
 * When to use: wiring the panel, or reading/changing tool settings from the deck.
 */

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
const TIERS: Array<{ tier: 1 | 2 | 3 | null; label: string }> = [
  { tier: 1, label: 'TIER 1 · PREFER' },
  { tier: 2, label: 'TIER 2 · FALLBACK' },
  { tier: 3, label: 'TIER 3 · USE DELIBERATELY' },
  { tier: null, label: 'OTHER' },
];

let initialized = false;
let entries: ToolManagerEntry[] = [];
let settings: ToolSettings = { schemaVersion: 1, order: [], disabled: [], instructions: {}, actionInstructions: {} };
let selected: string | null = null;
let dragging: string | null = null;
let dirty = false;

function entry(name: string): ToolManagerEntry | undefined {
  return entries.find((tool) => tool.name === name);
}

function applyState(state: ToolManagerState): void {
  entries = state.tools;
  settings = state.settings;
  if (!selected || !entry(selected)) selected = entries[0]?.name ?? null;
  dirty = false;
  render();
}

function showResult(kind: 'success' | 'error' | 'info', text: string): void {
  const target = byId<HTMLElement>('settings-tools-result');
  if (!target) return;
  target.className = `alert alert-${kind} alert-sm font-mono text-xs mt-3`;
  target.textContent = text;
  target.classList.remove('hidden');
}

function setDetailResult(text: string): void {
  const target = byId<HTMLElement>('settings-tools-detail-result');
  if (target) target.textContent = text;
}

function setDirty(next: boolean): void {
  dirty = next;
  byId<HTMLElement>('settings-tools-dirty')?.classList.toggle('hidden', !dirty);
}

function reorderWithinTier(source: string, target: string, tier: 1 | 2 | 3 | null): void {
  if (source === target) return;
  const group = entries.filter((tool) => tool.tier === tier);
  const from = group.findIndex((tool) => tool.name === source);
  const to = group.findIndex((tool) => tool.name === target);
  if (from < 0 || to < 0) return;
  const [moved] = group.splice(from, 1);
  group.splice(to, 0, moved);
  const grouped = TIERS.flatMap(({ tier: groupTier }) =>
    groupTier === tier ? group : entries.filter((tool) => tool.tier === groupTier),
  );
  const seen = new Set(grouped.map((tool) => tool.name));
  entries = [...grouped, ...entries.filter((tool) => !seen.has(tool.name))];
  setDirty(true);
  renderList(viewContext);
}

/** Apply one action-instruction edit to the pending settings payload. */
function setActionInstruction(group: string, action: string, value: string): void {
  const all = { ...(settings.actionInstructions || {}) };
  const groupInstructions = { ...(all[group] || {}) };
  if (value.trim()) groupInstructions[action] = value;
  else delete groupInstructions[action];
  if (Object.keys(groupInstructions).length) all[group] = groupInstructions;
  else delete all[group];
  settings = { ...settings, actionInstructions: all };
  setDirty(true);
}

const viewContext: ToolsViewContext = {
  entries: () => entries,
  entry,
  settings: () => settings,
  selected: () => selected,
  dragging: () => dragging,
  setDragging: (name) => {
    dragging = name;
  },
  select: (name) => selectTool(name),
  setEnabled: (name, enabled) => setEnabled(name, enabled),
  reorder: (source, target, tier) => reorderWithinTier(source, target, tier),
  setActionInstruction,
  markDirty: () => setDirty(true),
  setDetailResult,
  tiers: TIERS,
};

function render(): void {
  renderList(viewContext);
  renderDetail(viewContext);
  setDirty(dirty);
}

function selectTool(name: string): void {
  selected = name;
  renderList(viewContext);
  renderDetail(viewContext);
}

function setEnabled(name: string, enabled: boolean): void {
  const tool = entry(name);
  if (!tool) return;
  tool.enabled = enabled;
  const disabled = new Set(settings.disabled);
  if (enabled) disabled.delete(name);
  else disabled.add(name);
  settings = { ...settings, disabled: [...disabled] };
  setDirty(true);
  renderList(viewContext);
  renderDetail(viewContext);
}

function currentPayload(): Pick<ToolSettings, 'order' | 'disabled' | 'instructions' | 'actionInstructions'> {
  return {
    order: entries.map((tool) => tool.name),
    disabled: settings.disabled,
    instructions: settings.instructions,
    actionInstructions: settings.actionInstructions || {},
  };
}

async function refresh(): Promise<void> {
  try {
    const result = await api?.getToolManager();
    if (!result?.ok || !result.state) {
      showResult('error', result?.errors?.join('; ') || 'Could not load tool settings.');
      return;
    }
    applyState(result.state);
  } catch (error: any) {
    showResult('error', `Could not load tool settings: ${error?.message || error}`);
  }
}

async function save(): Promise<void> {
  const saveButton = byId<HTMLButtonElement>('settings-tools-save');
  if (saveButton) saveButton.disabled = true;
  try {
    const result = await api?.saveToolManager(currentPayload());
    if (!result?.ok || !result.state) {
      showResult('error', result?.errors?.join('; ') || 'Could not save tool settings.');
      return;
    }
    applyState(result.state);
    showResult('success', 'Tool settings saved. Restart MCP clients to apply them.');
  } catch (error: any) {
    showResult('error', `Could not save tool settings: ${error?.message || error}`);
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function resetAll(): Promise<void> {
  if (!window.confirm('Reset every tool to its catalog defaults, including order, enabled state and instructions?')) return;
  const result = await api?.resetToolManager();
  if (!result?.ok || !result.state) {
    showResult('error', result?.errors?.join('; ') || 'Could not reset tool settings.');
    return;
  }
  selected = null;
  applyState(result.state);
  showResult('success', 'All tools reset to defaults.');
}

const PRESETS: Record<string, Set<string>> = {
  core: new Set(['navigate', 'observe', 'find', 'act', 'wait_for', 'extract', 'capture', 'evaluate_javascript', 'human_in_loop', 'help']),
  research: new Set(['navigate', 'observe', 'find', 'act', 'wait_for', 'extract', 'capture', 'evaluate_javascript', 'human_in_loop', 'help', 'devtools', 'research', 'memory']),
  automation: new Set(['navigate', 'observe', 'find', 'act', 'wait_for', 'extract', 'capture', 'evaluate_javascript', 'human_in_loop', 'help', 'devtools', 'browser_workspace', 'shadow_iframes']),
};

function applyPreset(name: string): void {
  if (name !== 'full' && !PRESETS[name]) return;
  const preset = name === 'full' ? null : PRESETS[name];
  settings = {
    ...settings,
    disabled: entries.filter((tool) => (preset ? !preset.has(tool.name) : false)).map((tool) => tool.name),
  };
  for (const tool of entries) tool.enabled = preset ? preset.has(tool.name) : true;
  setDirty(true);
  renderList(viewContext);
  renderDetail(viewContext);
  showResult('info', `${name.toUpperCase()} preset applied. Save changes to keep it.`);
}

function resetTool(): void {
  const tool = selected ? entry(selected) : undefined;
  if (!tool) return;
  tool.enabled = true;
  const disabled = new Set(settings.disabled);
  disabled.delete(tool.name);
  const instructions = { ...settings.instructions };
  delete instructions[tool.name];
  const actionInstructions = { ...(settings.actionInstructions || {}) };
  delete actionInstructions[tool.name];
  settings = { ...settings, disabled: [...disabled], instructions, actionInstructions };
  setDirty(true);
  renderList(viewContext);
  renderDetail(viewContext);
}

/** When to use: wiring the tools panel once the deck document loads. */
export function initToolsPanel(): void {
  if (initialized) return;
  initialized = true;

  byId<HTMLButtonElement>('settings-tools-save')?.addEventListener('click', () => void save());
  byId<HTMLButtonElement>('settings-tools-reset-all')?.addEventListener('click', () => void resetAll());
  byId<HTMLSelectElement>('settings-tools-preset')?.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLSelectElement;
    if (target.value) applyPreset(target.value);
    target.value = '';
  });
  byId<HTMLButtonElement>('settings-tools-reset')?.addEventListener('click', resetTool);
  byId<HTMLInputElement>('settings-tools-enabled')?.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLInputElement;
    if (selected) setEnabled(selected, target.checked);
  });
  byId<HTMLTextAreaElement>('settings-tools-instructions')?.addEventListener('input', (event) => {
    const target = event.currentTarget as HTMLTextAreaElement;
    if (!selected) return;
    const instructions = { ...settings.instructions };
    if (target.value.trim()) instructions[selected] = target.value;
    else delete instructions[selected];
    settings = { ...settings, instructions };
    const tool = entry(selected);
    if (tool) tool.instruction = instructions[selected] || '';
    const chars = byId<HTMLElement>('settings-tools-override-chars');
    if (chars) chars.textContent = instructions[selected] ? `${instructions[selected].length.toLocaleString()} chars` : 'using default';
    setDetailResult(instructions[selected] ? 'Custom instructions active.' : 'Using catalog default.');
    const badge = document.querySelector<HTMLElement>(`[data-name="${selected}"] [data-role="custom"]`);
    badge?.classList.toggle('hidden', !instructions[selected]);
    setDirty(true);
  });
}

/** When to use: re-rendering the tools panel after a settings change. */
export function refreshToolsPanel(): void {
  initToolsPanel();
  void refresh();
}
