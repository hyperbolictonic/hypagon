/**
 * Tools-panel rendering: the tiered tool list and the selected tool's detail form.
 *
 * Pure view code: it reads state through the context the panel passes in and calls
 * back for every mutation, so the controller keeps ownership of state and saving.
 *
 * When to use: the panel changes what a tool card/detail shows. Wiring, state and
 * persistence live in tools-panel.ts.
 */

import type { ToolManagerEntry, ToolSettings } from '../shared/tool-settings.js';

/** When to use: wiring the tools-panel renderers — supply state accessors and the mutation callbacks the panel owns. */
export interface ToolsViewContext {
  entries: () => ToolManagerEntry[];
  entry: (name: string) => ToolManagerEntry | undefined;
  settings: () => ToolSettings;
  selected: () => string | null;
  dragging: () => string | null;
  setDragging: (name: string | null) => void;
  select: (name: string) => void;
  setEnabled: (name: string, enabled: boolean) => void;
  reorder: (source: string, target: string, tier: 1 | 2 | 3 | null) => void;
  setActionInstruction: (group: string, action: string, value: string) => void;
  markDirty: () => void;
  setDetailResult: (text: string) => void;
  tiers: Array<{ tier: 1 | 2 | 3 | null; label: string }>;
}

/** When to use: looking up a deck element by id while rendering the tools panel. */
export const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

/** When to use: refreshing the enabled/total counter above the tool list. */
export function updateSummary(entries: ToolManagerEntry[]): void {
  const summary = byId<HTMLElement>('settings-tools-summary');
  if (summary) {
    const enabled = entries.filter((tool) => tool.enabled).length;
    summary.textContent = `${enabled}/${entries.length}`;
  }
}

/** When to use: redrawing the tiered tool cards after an entry or selection change. */
export function renderList(ctx: ToolsViewContext): void {
  const list = byId<HTMLElement>('settings-tools-list');
  if (!list) return;
  const entries = ctx.entries();
  const selected = ctx.selected();
  list.replaceChildren();
  for (const { tier, label } of ctx.tiers) {
    const group = entries.filter((tool) => tool.tier === tier);
    if (!group.length) continue;
    const heading = document.createElement('div');
    heading.className = 'font-mono text-[10px] uppercase tracking-wider text-base-content/40 pt-1';
    heading.textContent = `${label} · ${group.length}`;
    list.append(heading);

    for (const tool of group) {
      const card = document.createElement('div');
      card.className = `group rounded border p-2 cursor-pointer transition-colors ${
        tool.name === selected
          ? 'border-accent bg-base-100'
          : 'border-base-300 bg-base-200/30 hover:border-base-content/30'
      } ${tool.enabled ? '' : 'opacity-50'}`;
      card.draggable = true;
      card.tabIndex = 0;
      card.dataset.name = tool.name;
      card.dataset.tier = String(tool.tier ?? 'other');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Edit ${tool.name}`);
      card.addEventListener('click', () => ctx.select(tool.name));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          ctx.select(tool.name);
        }
      });
      card.addEventListener('dragstart', (event) => {
        ctx.setDragging(tool.name);
        event.dataTransfer?.setData('text/plain', tool.name);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        card.classList.add('opacity-40');
      });
      card.addEventListener('dragend', () => {
        ctx.setDragging(null);
        card.classList.remove('opacity-40');
      });
      card.addEventListener('dragover', (event) => {
        const dragging = ctx.dragging();
        if (dragging && dragging !== tool.name && ctx.entry(dragging)?.tier === tool.tier) {
          event.preventDefault();
          card.classList.add('ring-1', 'ring-accent');
        }
      });
      card.addEventListener('dragleave', () => card.classList.remove('ring-1', 'ring-accent'));
      card.addEventListener('drop', (event) => {
        event.preventDefault();
        card.classList.remove('ring-1', 'ring-accent');
        const dragging = ctx.dragging();
        if (dragging) ctx.reorder(dragging, tool.name, tool.tier);
        ctx.setDragging(null);
      });

      const row = document.createElement('div');
      row.className = 'flex items-start gap-2';
      const handle = document.createElement('span');
      handle.className = 'text-base-content/30 font-mono text-[10px] pt-0.5 cursor-grab';
      handle.textContent = '⋮⋮';
      handle.title = 'Drag to reorder within this tier';
      const body = document.createElement('div');
      body.className = 'min-w-0 flex-1';
      const name = document.createElement('div');
      name.className = 'font-mono text-[11px] font-bold truncate';
      name.textContent = tool.name;
      const meta = document.createElement('div');
      meta.className = 'flex items-center gap-1.5 mt-1';
      const tierBadge = document.createElement('span');
      tierBadge.className = 'badge badge-ghost badge-xs font-mono text-[9px]';
      tierBadge.textContent = tool.tier ? `T${tool.tier}` : '—';
      const custom = document.createElement('span');
      custom.className = `badge badge-xs font-mono text-[9px] ${tool.instruction ? 'badge-info' : 'hidden'}`;
      custom.dataset.role = 'custom';
      custom.textContent = 'CUSTOM';
      meta.append(tierBadge, custom);
      body.append(name, meta);
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'toggle toggle-xs toggle-success shrink-0';
      toggle.checked = tool.enabled;
      toggle.title = tool.enabled ? 'Disable this tool' : 'Enable this tool';
      toggle.addEventListener('click', (event) => event.stopPropagation());
      toggle.addEventListener('change', () => ctx.setEnabled(tool.name, toggle.checked));
      row.append(handle, body, toggle);
      card.append(row);
      list.append(card);
    }
  }
  updateSummary(entries);
}

/** When to use: redrawing the selected tool form, action list and instruction editors. */
export function renderDetail(ctx: ToolsViewContext): void {
  const empty = byId<HTMLElement>('settings-tools-empty');
  const detail = byId<HTMLElement>('settings-tools-detail');
  const selected = ctx.selected();
  const tool = selected ? ctx.entry(selected) : undefined;
  if (!tool) {
    empty?.classList.remove('hidden');
    detail?.classList.add('hidden');
    return;
  }
  const settings = ctx.settings();
  empty?.classList.add('hidden');
  detail?.classList.remove('hidden');

  const name = byId<HTMLElement>('settings-tools-name');
  const tier = byId<HTMLElement>('settings-tools-tier');
  const state = byId<HTMLElement>('settings-tools-state');
  const enabled = byId<HTMLInputElement>('settings-tools-enabled');
  const defaultText = byId<HTMLElement>('settings-tools-default');
  const defaultChars = byId<HTMLElement>('settings-tools-default-chars');
  const instructions = byId<HTMLTextAreaElement>('settings-tools-instructions');
  const overrideChars = byId<HTMLElement>('settings-tools-override-chars');
  if (name) name.textContent = tool.name;
  if (tier) tier.textContent = tool.tierLabel;
  if (state) {
    state.textContent = tool.enabled ? 'ON' : 'OFF';
    state.className = `badge badge-sm font-mono text-[10px] ${tool.enabled ? 'badge-success' : 'badge-ghost'}`;
  }
  if (enabled) enabled.checked = tool.enabled;
  if (defaultText) defaultText.textContent = tool.description;
  if (defaultChars) defaultChars.textContent = `${tool.description.length.toLocaleString()} chars`;
  if (instructions && instructions.value !== (settings.instructions[tool.name] || '')) {
    instructions.value = settings.instructions[tool.name] || '';
  }
  if (instructions) instructions.placeholder = `Default: ${tool.description.slice(0, 160)}${tool.description.length > 160 ? '…' : ''}`;
  if (overrideChars) {
    const length = (settings.instructions[tool.name] || '').length;
    overrideChars.textContent = length ? `${length.toLocaleString()} chars` : 'using default';
  }
  const actionsSection = byId<HTMLElement>('settings-tools-actions-section');
  const actionsHost = byId<HTMLElement>('settings-tools-actions');
  const actionsCount = byId<HTMLElement>('settings-tools-actions-count');
  if (actionsSection && actionsHost && actionsCount) {
    const actions = tool.actions || [];
    actionsSection.classList.toggle('hidden', actions.length === 0);
    actionsCount.textContent = actions.length ? `(${actions.length})` : '';
    actionsHost.replaceChildren();
    for (const action of actions) {
      const row = document.createElement('details');
      row.className = 'rounded bg-base-200/40 px-2 py-1';
      const summary = document.createElement('summary');
      summary.className = 'flex flex-wrap items-baseline gap-2 cursor-pointer';
      const actionName = document.createElement('code');
      actionName.className = 'font-mono text-[10px] text-accent';
      actionName.textContent = action.name;
      const desc = document.createElement('span');
      desc.className = 'text-[10px] text-base-content/60 flex-1 min-w-0';
      desc.textContent = action.description;
      const target = document.createElement('span');
      target.className = 'font-mono text-[9px] text-base-content/35';
      target.textContent = action.tool;
      const custom = document.createElement('span');
      custom.className = `badge badge-xs font-mono text-[9px] ${action.instruction ? 'badge-info' : 'hidden'}`;
      custom.textContent = 'CUSTOM';
      summary.append(actionName, desc, target, custom);
      const editor = document.createElement('textarea');
      editor.className = 'textarea textarea-xs w-full mt-2 h-20 font-mono text-[10px]';
      editor.placeholder = `Default: ${action.description}`;
      editor.value = action.instruction;
      editor.addEventListener('input', () => {
        const group = ctx.selected();
        if (!group) return;
        ctx.setActionInstruction(group, action.name, editor.value);
        action.instruction = editor.value.trim();
        custom.classList.toggle('hidden', !action.instruction);
        ctx.markDirty();
      });
      row.append(summary, editor);
      actionsHost.append(row);
    }
  }
  ctx.setDetailResult(tool.instruction ? 'Custom instructions active.' : 'Using catalog default.');
}
