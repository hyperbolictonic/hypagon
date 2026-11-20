/**
 * The research panel's DOM surface: element lookup and the small renderers that touch it.
 *
 * Kept apart from the controller so the state machine can be read (and later tested)
 * without a document, and so a layout change has one place to land.
 *
 * When to use: `initResearchPanel` collects the elements; the controller renders through
 * the helpers here.
 */
import type { ResearchTier } from '../shared/research-events.js';

/** When to use: one source row and the cells that are updated as events arrive. */
export interface ResearchRow {
  root: HTMLTableRowElement;
  url: string;
  anchors?: import('../shared/research-events.js').ResearchAnchorDetail[];
  tier: HTMLElement;
  kb: HTMLElement;
  ms: HTMLElement;
  hl: HTMLElement;
  status: HTMLElement;
}

/** When to use: restoring the sidebar after the research surface closes. */
export type SidebarMode = 'docked' | 'floating' | 'collapsed';

/** When to use: the stats strip's counters (reset per run, finalised by `run-done`). */
export interface ResearchStats {
  sources: number;
  indexed: number;
  bytes: number;
  humans: number;
  anchors: number;
  tiers: Record<ResearchTier, number>;
}

/** When to use: the tier badge colours on a source row. */
export const TIER_BADGE: Record<ResearchTier, string> = {
  llm: 'badge-success',
  static: 'badge-info',
  render: 'badge-warning',
};

/** When to use: a finished source — the event shape the row renderer consumes. */
export type SourceDone = Extract<import('../shared/research-events.js').ResearchEvent, { type: 'source-done' }>;

/** When to use: every element the research panel reads or writes. */
export interface ResearchDom {
  view: HTMLElement;
  launcher: HTMLButtonElement | null;
  launcherDot: HTMLElement | null;
  launcherBadge: HTMLElement | null;
  closeButton: HTMLButtonElement | null;
  runButton: HTMLButtonElement;
  queryInput: HTMLInputElement | null;
  engineSelect: HTMLSelectElement | null;
  statusEl: HTMLElement | null;
  elapsedEl: HTMLElement | null;
  escBadge: HTMLElement | null;
  rowsEl: HTMLElement;
  emptyEl: HTMLElement | null;
  logEl: HTMLElement;
  logCountEl: HTMLElement | null;
  statSources: HTMLElement | null;
  statIndexed: HTMLElement | null;
  statBytes: HTMLElement | null;
  tierLlm: HTMLElement | null;
  tierStatic: HTMLElement | null;
  tierRender: HTMLElement | null;
  statHumans: HTMLElement | null;
  statAnchors: HTMLElement | null;
  fontDec: HTMLButtonElement | null;
  fontInc: HTMLButtonElement | null;
  fontLabel: HTMLElement | null;
  revalidateBtn: HTMLButtonElement | null;
}

const byId = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

/** When to use: `initResearchPanel` — returns null when the panel is not in this document. */
export function collectResearchDom(): ResearchDom | null {
  const view = byId<HTMLElement>('research-view');
  const runButton = byId<HTMLButtonElement>('research-run');
  const rowsEl = byId<HTMLElement>('research-rows');
  const logEl = byId<HTMLElement>('research-log');
  if (!view || !runButton || !rowsEl || !logEl) return null;

  return {
    view,
    runButton,
    rowsEl,
    logEl,
    launcher: byId<HTMLButtonElement>('research-tab-btn'),
    launcherDot: byId<HTMLElement>('research-tab-dot'),
    launcherBadge: byId<HTMLElement>('research-tab-badge'),
    closeButton: byId<HTMLButtonElement>('research-close'),
    queryInput: byId<HTMLInputElement>('research-query'),
    engineSelect: byId<HTMLSelectElement>('research-engine'),
    statusEl: byId<HTMLElement>('research-status'),
    elapsedEl: byId<HTMLElement>('research-elapsed'),
    escBadge: byId<HTMLElement>('research-escalations'),
    emptyEl: byId<HTMLElement>('research-empty'),
    logCountEl: byId<HTMLElement>('research-log-count'),
    statSources: byId<HTMLElement>('research-stat-sources'),
    statIndexed: byId<HTMLElement>('research-stat-indexed'),
    statBytes: byId<HTMLElement>('research-stat-bytes'),
    tierLlm: byId<HTMLElement>('research-tier-llm'),
    tierStatic: byId<HTMLElement>('research-tier-static'),
    tierRender: byId<HTMLElement>('research-tier-render'),
    statHumans: byId<HTMLElement>('research-stat-humans'),
    statAnchors: byId<HTMLElement>('research-stat-anchors'),
    fontDec: byId<HTMLButtonElement>('research-font-dec'),
    fontInc: byId<HTMLButtonElement>('research-font-inc'),
    fontLabel: byId<HTMLElement>('research-font-label'),
    revalidateBtn: byId<HTMLButtonElement>('research-revalidate'),
  };
}

function cell(className: string, text = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = className;
  td.textContent = text;
  return td;
}

function line(className: string, text = ''): HTMLDivElement {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

/** When to use: `reset` and `run-done` — one place that knows the stats layout. */
export function renderStats(dom: ResearchDom, stats: ResearchStats): void {
  if (dom.statSources) dom.statSources.textContent = String(stats.sources);
  if (dom.statIndexed) dom.statIndexed.textContent = String(stats.indexed);
  if (dom.statBytes) dom.statBytes.textContent = `${(stats.bytes / 1024).toFixed(1)} KB`;
  if (dom.tierLlm) dom.tierLlm.textContent = String(stats.tiers.llm);
  if (dom.tierStatic) dom.tierStatic.textContent = String(stats.tiers.static);
  if (dom.tierRender) dom.tierRender.textContent = String(stats.tiers.render);
  if (dom.statHumans) dom.statHumans.textContent = String(stats.humans);
  if (dom.statAnchors) dom.statAnchors.textContent = String(stats.anchors);
}

/** When to use: the launcher's status dot (idle / running / done / error). */
export function setLauncherDot(dom: ResearchDom, classes: string): void {
  if (dom.launcherDot) dom.launcherDot.className = `w-1.5 h-1.5 rounded-full ${classes}`;
}

/** When to use: the launcher's source-count badge (hidden at zero). */
export function setLauncherBadge(dom: ResearchDom, count: number): void {
  if (!dom.launcherBadge) return;
  if (count > 0) {
    dom.launcherBadge.textContent = String(count);
    dom.launcherBadge.classList.remove('hidden');
  } else {
    dom.launcherBadge.classList.add('hidden');
  }
}

/**
 * When to use: a `source-start`/`source-done` row — created once per key, reused after.
 *
 * The row is inserted immediately (before the page is fetched) so the table shows what is
 * queued, not only what finished.
 */
export function createRow(
  dom: ResearchDom,
  rows: Map<string, ResearchRow>,
  key: string,
  rank: string,
  url: string,
  title: string,
): ResearchRow {
  const existing = rows.get(key);
  if (existing) return existing;

  dom.emptyEl?.classList.add('hidden');

  const root = document.createElement('tr');
  root.className = 'hover';

  const rankCell = cell('w-8 text-base-content/40', rank);

  const sourceCell = document.createElement('td');
  const titleEl = line('truncate max-w-[560px] text-[11px]', title || url);
  const urlEl = line('truncate max-w-[560px] text-[9px] text-base-content/40', url);
  sourceCell.append(titleEl, urlEl);

  const tierCell = cell('w-16');
  const badge = document.createElement('span');
  badge.className = 'badge badge-xs badge-neutral';
  badge.textContent = '…';
  tierCell.appendChild(badge);

  const kbCell = cell('w-14 text-right tabular-nums', '—');
  const msCell = cell('w-14 text-right tabular-nums', '—');
  const hlCell = cell('w-10 text-right tabular-nums', '—');
  const statusCell = cell('w-56 text-[10px] text-base-content/50', 'queued');

  root.append(rankCell, sourceCell, tierCell, kbCell, msCell, hlCell, statusCell);
  dom.rowsEl.appendChild(root);

  const entry: ResearchRow = { root, url, tier: tierCell, kb: kbCell, ms: msCell, hl: hlCell, status: statusCell };
  rows.set(key, entry);
  return entry;
}

/**
 * When to use: `source-done` — fills a row's tier, size, time, highlights and status, and
 * returns true when the event escalated (so the caller can count it and log it once).
 */
export function applySourceDone(
  row: ResearchRow,
  event: SourceDone,
  onCheckCitation: (row: ResearchRow, button: HTMLButtonElement) => void,
): boolean {
  row.tier.replaceChildren();
  const badge = document.createElement('span');
  badge.className = `badge badge-xs ${TIER_BADGE[event.via] ?? 'badge-neutral'}`;
  badge.textContent = event.via;
  row.tier.appendChild(badge);

  row.kb.textContent = (event.bytes / 1024).toFixed(1);
  row.ms.textContent = String(event.ms);
  row.hl.textContent = String(event.highlights);
  row.hl.className = `w-10 text-right tabular-nums ${event.highlights > 0 ? 'text-base-content' : 'text-base-content/30'}`;

  row.status.className = `w-56 text-[10px] ${event.error ? 'text-error' : 'text-base-content/50'}`;
  row.status.textContent = event.error
    ? `error · ${event.error}`
    : event.indexed
      ? 'indexed'
      : 'ok';

  if (event.humanAssisted) {
    const note = document.createElement('div');
    note.className = 'text-[9px] text-error mt-0.5';
    note.textContent = `human-assisted (${Math.round((event.humanMs ?? 0) / 1000)}s)`;
    row.status.appendChild(note);
  }

  if (event.anchors) {
    const anchorNote = document.createElement('div');
    anchorNote.className = 'text-[9px] text-base-content/40 mt-0.5';
    anchorNote.textContent = `${event.anchors} anchor(s)`;
    row.status.appendChild(anchorNote);
  }

  row.anchors = event.anchorDetails;
  if (event.anchorDetails?.length) {
    const check = document.createElement('button');
    check.className = 'btn btn-xs btn-ghost mt-1';
    check.textContent = 'CHECK CITATION';
    check.title = 'Revalidate the top anchor against the live page';
    check.addEventListener('click', () => onCheckCitation(row, check));
    row.status.appendChild(check);
  }

  if (event.escalation) {
    const note = document.createElement('div');
    note.className = 'text-[9px] text-warning mt-0.5';
    note.textContent = `← ${event.escalation.from}: ${event.escalation.reason}`;
    row.status.appendChild(note);
    return true;
  }
  return false;
}
