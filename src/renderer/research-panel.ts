/**
 * Research workspace.
 *
 * Research is a full-bleed surface, not a sidebar widget: opening it hides the browser view and
 * collapses the sidebar automatically, then restores both on close. The tab-bar launcher stays
 * pinned and reflects run state (running / done / escalated / error).
 *
 * Layout is deliberately dense: a source table (tier, size, time, highlights, status), a stats
 * strip (sources / indexed / data / tier mix) and a terminal log — everything visible at a glance.
 *
 * The same events the agent receives are rendered here, so a tier escalation is visible to both.
 * `human-needed` rows are the future HIL hand-off point (OPEN navigates the active tab for now).
 */
import type { ElectronAPI } from '../preload/index.js';
import type { ResearchEvent, ResearchTier } from '../shared/research-events.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
const byId = <T extends HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const TIER_CLASS: Record<ResearchTier, string> = {
  llm: 'text-success',
  static: 'text-info',
  render: 'text-warning',
};

const TIER_BADGE: Record<ResearchTier, string> = {
  llm: 'badge-success',
  static: 'badge-info',
  render: 'badge-warning',
};

interface Row {
  root: HTMLTableRowElement;
  tier: HTMLElement;
  kb: HTMLElement;
  ms: HTMLElement;
  hl: HTMLElement;
  status: HTMLElement;
}

type SidebarMode = 'docked' | 'floating' | 'collapsed';

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

export function initResearchPanel(): void {
  const view = byId<HTMLElement>('research-view');
  const launcher = byId<HTMLButtonElement>('research-tab-btn');
  const launcherDot = byId<HTMLElement>('research-tab-dot');
  const launcherBadge = byId<HTMLElement>('research-tab-badge');
  const closeButton = byId<HTMLButtonElement>('research-close');
  const runButton = byId<HTMLButtonElement>('research-run');
  const queryInput = byId<HTMLInputElement>('research-query');
  const engineSelect = byId<HTMLSelectElement>('research-engine');
  const statusEl = byId<HTMLElement>('research-status');
  const elapsedEl = byId<HTMLElement>('research-elapsed');
  const escBadge = byId<HTMLElement>('research-escalations');
  const rowsEl = byId<HTMLElement>('research-rows');
  const emptyEl = byId<HTMLElement>('research-empty');
  const logEl = byId<HTMLElement>('research-log');
  const logCountEl = byId<HTMLElement>('research-log-count');
  const statSources = byId<HTMLElement>('research-stat-sources');
  const statIndexed = byId<HTMLElement>('research-stat-indexed');
  const statBytes = byId<HTMLElement>('research-stat-bytes');
  const tierLlm = byId<HTMLElement>('research-tier-llm');
  const tierStatic = byId<HTMLElement>('research-tier-static');
  const tierRender = byId<HTMLElement>('research-tier-render');

  if (!view || !runButton || !rowsEl || !logEl) return;

  const rows = new Map<string, Row>();
  let startedAt = 0;
  let ticker: number | undefined;
  let escalationCount = 0;
  let logLines = 0;
  let isOpen = false;
  let savedSidebarMode: SidebarMode | null = null;

  const stats = {
    sources: 0,
    indexed: 0,
    bytes: 0,
    tiers: { llm: 0, static: 0, render: 0 } as Record<ResearchTier, number>,
  };

  const setDot = (classes: string): void => {
    if (launcherDot) launcherDot.className = `w-1.5 h-1.5 rounded-full ${classes}`;
  };

  const setLauncherBadge = (count: number): void => {
    if (!launcherBadge) return;
    if (count > 0) {
      launcherBadge.textContent = String(count);
      launcherBadge.classList.remove('hidden');
    } else {
      launcherBadge.classList.add('hidden');
    }
  };

  const setLauncherState = (state: 'idle' | 'running' | 'done' | 'error'): void => {
    if (state === 'idle') setDot('bg-base-content/30');
    else if (state === 'running') setDot('bg-accent animate-pulse');
    else if (state === 'done') setDot(escalationCount > 0 ? 'bg-warning' : 'bg-success');
    else setDot('bg-error');
  };

  const renderStats = (): void => {
    if (statSources) statSources.textContent = String(stats.sources);
    if (statIndexed) statIndexed.textContent = String(stats.indexed);
    if (statBytes) statBytes.textContent = `${(stats.bytes / 1024).toFixed(1)} KB`;
    if (tierLlm) tierLlm.textContent = String(stats.tiers.llm);
    if (tierStatic) tierStatic.textContent = String(stats.tiers.static);
    if (tierRender) tierRender.textContent = String(stats.tiers.render);
  };

  const openView = async (): Promise<void> => {
    if (isOpen) return;
    isOpen = true;
    savedSidebarMode = (await api?.getSidebarMode?.()) ?? 'floating';
    await api?.setSidebarMode?.('collapsed');
    api?.setViewportVisibility?.(false);
    view.classList.remove('hidden');
    view.classList.add('flex');
    queryInput?.focus();
  };

  const closeView = async (): Promise<void> => {
    if (!isOpen) return;
    isOpen = false;
    view.classList.add('hidden');
    view.classList.remove('flex');
    api?.setViewportVisibility?.(true);
    if (savedSidebarMode) await api?.setSidebarMode?.(savedSidebarMode);
  };

  const log = (text: string, tone = 'text-base-content/60'): void => {
    const row = document.createElement('div');
    row.className = 'flex gap-1.5';
    const stamp = document.createElement('span');
    stamp.className = 'text-base-content/30 shrink-0 tabular-nums';
    stamp.textContent = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    const body = document.createElement('span');
    body.className = tone;
    body.textContent = text;
    row.append(stamp, body);
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
    logLines++;
    if (logCountEl) logCountEl.textContent = `${logLines} lines`;
  };

  const stopTicker = (): void => {
    if (ticker !== undefined) {
      window.clearInterval(ticker);
      ticker = undefined;
    }
  };

  const reset = (): void => {
    rows.clear();
    rowsEl.replaceChildren();
    logEl.replaceChildren();
    rowsEl.closest('table')?.classList.remove('hidden');
    emptyEl?.classList.add('hidden');
    escalationCount = 0;
    logLines = 0;
    stats.sources = 0;
    stats.indexed = 0;
    stats.bytes = 0;
    stats.tiers = { llm: 0, static: 0, render: 0 };
    renderStats();
    if (logCountEl) logCountEl.textContent = '0 lines';
    if (escBadge) escBadge.textContent = '0 esc';
    if (statusEl) statusEl.textContent = 'running';
    setLauncherBadge(0);
    setLauncherState('running');
    startedAt = Date.now();
    stopTicker();
    ticker = window.setInterval(() => {
      if (elapsedEl) elapsedEl.textContent = `${Date.now() - startedAt}ms`;
    }, 100);
  };

  const rowFor = (key: string, rank: string, url: string, title: string): Row => {
    const existing = rows.get(key);
    if (existing) return existing;

    emptyEl?.classList.add('hidden');

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
    rowsEl.appendChild(root);

    const entry: Row = { root, tier: tierCell, kb: kbCell, ms: msCell, hl: hlCell, status: statusCell };
    rows.set(key, entry);
    return entry;
  };

  api?.onResearchEvent?.((event: ResearchEvent) => {
    switch (event.type) {
      case 'run-start':
        void openView();
        reset();
        log(`run ${event.runId.slice(0, 8)} · ${event.query}`);
        break;

      case 'search-done':
        log(
          `search ${event.engine ?? '?'} · ${event.results} result(s)` +
            (event.blocked ? ' · provider blocked' : ''),
          event.blocked ? 'text-warning' : undefined,
        );
        break;

      case 'source-start':
        rowFor(`s${event.rank}`, `#${event.rank}`, event.url, event.title);
        break;

      case 'source-done': {
        const row = rowFor(`s${event.rank}`, `#${event.rank}`, event.url, event.title);
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

        if (event.escalation) {
          escalationCount++;
          if (escBadge) escBadge.textContent = `${escalationCount} esc`;
          const note = document.createElement('div');
          note.className = 'text-[9px] text-warning mt-0.5';
          note.textContent = `← ${event.escalation.from}: ${event.escalation.reason}`;
          row.status.appendChild(note);
          log(`ESCALATED ${event.url} · ${event.escalation.reason}`, 'text-warning');
        }

        stats.sources = Math.max(
          stats.sources,
          [...rows.keys()].filter((key) => key.startsWith('s')).length,
        );
        stats.bytes += event.bytes;
        stats.tiers[event.via] += 1;
        if (event.indexed) stats.indexed += 1;
        renderStats();
        setLauncherBadge(stats.sources);
        break;
      }

      case 'human-needed': {
        const row = rowFor(`h${event.url}`, '!', event.url, 'Human intervention required');
        row.tier.replaceChildren();
        const badge = document.createElement('span');
        badge.className = 'badge badge-xs badge-error';
        badge.textContent = event.reason;
        row.tier.appendChild(badge);
        row.status.className = 'w-56 text-[10px] text-error';
        row.status.textContent = '';
        const button = document.createElement('button');
        button.className = 'btn btn-xs btn-error';
        button.textContent = 'OPEN';
        button.addEventListener('click', () => {
          void api?.navigate(event.url);
        });
        row.status.appendChild(button);
        log(`human needed · ${event.url} · ${event.reason}`, 'text-error');
        break;
      }

      case 'run-done':
        stopTicker();
        if (statusEl) statusEl.textContent = 'done';
        if (elapsedEl) elapsedEl.textContent = `${event.elapsedMs}ms`;
        if (escBadge) escBadge.textContent = `${event.escalations} esc`;
        stats.sources = event.sources;
        stats.indexed = event.indexed;
        stats.bytes = event.bytes;
        stats.tiers = { ...event.tiers };
        renderStats();
        setLauncherBadge(event.sources);
        setLauncherState('done');
        log(`done · ${event.sources} source(s) · ${event.indexed} indexed`);
        break;

      case 'run-error':
        stopTicker();
        if (statusEl) statusEl.textContent = 'error';
        setLauncherState('error');
        log(`error · ${event.message}`, 'text-error');
        break;
    }
  });

  launcher?.addEventListener('click', () => {
    if (isOpen) void closeView();
    else void openView();
  });

  closeButton?.addEventListener('click', () => {
    void closeView();
  });

  runButton.addEventListener('click', async () => {
    const query = (queryInput?.value ?? '').trim();
    if (!query) {
      log('enter a query first', 'text-warning');
      return;
    }

    await openView();
    runButton.disabled = true;
    reset();
    try {
      await api?.researchRun({
        query,
        engine: engineSelect?.value || undefined,
        maxSources: 5,
      });
    } catch (error) {
      log(`error · ${(error as Error).message}`, 'text-error');
      if (statusEl) statusEl.textContent = 'error';
      setLauncherState('error');
      stopTicker();
    } finally {
      runButton.disabled = false;
    }
  });

  renderStats();
  setLauncherState('idle');
}
