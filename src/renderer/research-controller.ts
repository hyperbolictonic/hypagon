/**
 * The research panel's state machine.
 *
 * It owns the run state (rows, stats, counters, timer, open/closed) and turns the same
 * `ResearchEvent`s the agent receives into rows and log lines, so a tier escalation is
 * visible to both. Rendering details live in `research-dom.ts`.
 *
 * When to use: `initResearchPanel` creates one per document and forwards events to it.
 */
import type { ElectronAPI } from '../preload/index.js';
import type { ResearchEvent } from '../shared/research-events.js';
import {
  applySourceDone,
  createRow,
  renderStats,
  setLauncherBadge,
  setLauncherDot,
  type ResearchDom,
  type ResearchRow,
  type ResearchStats,
  type SidebarMode,
  type SourceDone,
} from './research-dom.js';
import { checkCitation } from './research-citations.js';

type HumanNeeded = Extract<ResearchEvent, { type: 'human-needed' }>;
type HumanDone = Extract<ResearchEvent, { type: 'human-done' }>;
type Activity = Extract<ResearchEvent, { type: 'activity' }>;
type RunDone = Extract<ResearchEvent, { type: 'run-done' }>;
type RunError = Extract<ResearchEvent, { type: 'run-error' }>;

/** When to use: `initResearchPanel` — one controller owns one panel's run state. */
export class ResearchController {
  private readonly dom: ResearchDom;
  private readonly api: ElectronAPI | undefined;
  private readonly rows = new Map<string, ResearchRow>();
  private stats: ResearchStats = {
    sources: 0,
    indexed: 0,
    bytes: 0,
    humans: 0,
    anchors: 0,
    tiers: { llm: 0, static: 0, render: 0 },
  };
  private startedAt = 0;
  private ticker: number | undefined;
  private escalationCount = 0;
  private logLines = 0;
  private isOpen = false;
  private savedSidebarMode: SidebarMode | null = null;

  constructor(dom: ResearchDom, api: ElectronAPI | undefined) {
    this.dom = dom;
    this.api = api;
  }

  /** True while the surface is open (the launcher dot then defers to the run state). */
  get isVisible(): boolean {
    return this.isOpen;
  }

  /** When to use: the launcher dot — done turns warning-coloured after an escalation. */
  setLauncherState(state: 'idle' | 'running' | 'done' | 'error'): void {
    if (state === 'idle') setLauncherDot(this.dom, 'bg-base-content/30');
    else if (state === 'running') setLauncherDot(this.dom, 'bg-accent animate-pulse');
    else if (state === 'done') setLauncherDot(this.dom, this.escalationCount > 0 ? 'bg-warning' : 'bg-success');
    else setLauncherDot(this.dom, 'bg-error');
  }

  /** When to use: after any stats change. */
  renderStats(): void {
    renderStats(this.dom, this.stats);
  }

  /** When to use: opening the workspace — hides the browser view and collapses the sidebar. */
  async openView(): Promise<void> {
    if (this.isOpen) return;
    this.isOpen = true;
    this.savedSidebarMode = (await this.api?.getSidebarMode?.()) ?? 'floating';
    await this.api?.setSidebarMode?.('collapsed');
    this.api?.setViewportVisibility?.(false);
    this.dom.view.classList.remove('hidden');
    this.dom.view.classList.add('flex');
    this.dom.queryInput?.focus();
  }

  /** When to use: closing the workspace — restores the sidebar and the browser view. */
  async closeView(): Promise<void> {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dom.view.classList.add('hidden');
    this.dom.view.classList.remove('flex');
    this.api?.setViewportVisibility?.(true);
    if (this.savedSidebarMode) await this.api?.setSidebarMode?.(this.savedSidebarMode);
  }

  /** When to use: the launcher button. */
  async toggle(): Promise<void> {
    if (this.isOpen) await this.closeView();
    else await this.openView();
  }

  /** When to use: appending a timestamped line to the terminal panel. */
  log(text: string, tone?: string): void {
    const row = document.createElement('div');
    row.className = 'flex gap-1.5';
    const stamp = document.createElement('span');
    stamp.className = 'text-base-content/30 shrink-0 tabular-nums';
    stamp.textContent = `${((Date.now() - this.startedAt) / 1000).toFixed(1)}s`;
    const body = document.createElement('span');
    body.className = tone ?? 'text-base-content/60';
    body.textContent = text;
    row.append(stamp, body);
    this.dom.logEl.appendChild(row);
    this.dom.logEl.scrollTop = this.dom.logEl.scrollHeight;
    this.logLines++;
    if (this.dom.logCountEl) this.dom.logCountEl.textContent = `${this.logLines} lines`;
  }

  /** When to use: `run-done` / `run-error` — stops the elapsed-time clock. */
  stopTicker(): void {
    if (this.ticker !== undefined) {
      window.clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  /** When to use: a new run (and the RUN button before it fires). */
  reset(): void {
    this.rows.clear();
    this.dom.rowsEl.replaceChildren();
    this.dom.logEl.replaceChildren();
    this.dom.rowsEl.closest('table')?.classList.remove('hidden');
    this.dom.emptyEl?.classList.add('hidden');
    this.escalationCount = 0;
    this.logLines = 0;
    this.stats.sources = 0;
    this.stats.indexed = 0;
    this.stats.bytes = 0;
    this.stats.humans = 0;
    this.stats.anchors = 0;
    this.stats.tiers = { llm: 0, static: 0, render: 0 };
    this.renderStats();
    if (this.dom.logCountEl) this.dom.logCountEl.textContent = '0 lines';
    if (this.dom.escBadge) this.dom.escBadge.textContent = '0 esc';
    if (this.dom.statusEl) this.dom.statusEl.textContent = 'running';
    setLauncherBadge(this.dom, 0);
    this.setLauncherState('running');
    this.startedAt = Date.now();
    this.stopTicker();
    this.ticker = window.setInterval(() => {
      if (this.dom.elapsedEl) this.dom.elapsedEl.textContent = `${Date.now() - this.startedAt}ms`;
    }, 100);
  }

  /** When to use: one source row, created on `source-start` and reused on `source-done`. */
  rowFor(key: string, rank: string, url: string, title: string): ResearchRow {
    return createRow(this.dom, this.rows, key, rank, url, title);
  }

  /** When to use: every event from `onResearchEvent`. */
  applyEvent(event: ResearchEvent): void {
    switch (event.type) {
      case 'run-start':
        void this.openView();
        this.reset();
        this.log(`run ${event.runId.slice(0, 8)} · ${event.query}`);
        break;
      case 'search-done':
        this.log(
          `search ${event.engine ?? '?'} · ${event.results} result(s)` +
            (event.blocked ? ' · provider blocked' : ''),
          event.blocked ? 'text-warning' : undefined,
        );
        break;
      case 'source-start':
        this.rowFor(`s${event.rank}`, `#${event.rank}`, event.url, event.title);
        break;
      case 'source-done':
        this.onSourceDone(event);
        break;
      case 'human-needed':
        this.onHumanNeeded(event);
        break;
      case 'human-done':
        this.onHumanDone(event);
        break;
      case 'activity':
        this.onActivity(event);
        break;
      case 'run-done':
        this.onRunDone(event);
        break;
      case 'run-error':
        this.onRunError(event);
        break;
    }
  }

  /** When to use: `source-done` — tier, size, time, highlights, status and the notes. */
  private onSourceDone(event: SourceDone): void {
    const row = this.rowFor(`s${event.rank}`, `#${event.rank}`, event.url, event.title);
    const escalated = applySourceDone(row, event, (target, button) => void checkCitation(this.api, target, button));

    if (escalated) {
      this.escalationCount++;
      if (this.dom.escBadge) this.dom.escBadge.textContent = `${this.escalationCount} esc`;
      this.log(`ESCALATED ${event.url} · ${event.escalation!.reason}`, 'text-warning');
    }

    this.stats.sources = Math.max(
      this.stats.sources,
      [...this.rows.keys()].filter((key) => key.startsWith('s')).length,
    );
    this.stats.bytes += event.bytes;
    this.stats.tiers[event.via] += 1;
    if (event.humanAssisted) this.stats.humans += 1;
    if (event.anchors) this.stats.anchors += event.anchors;
    if (event.indexed) this.stats.indexed += 1;
    this.renderStats();
    setLauncherBadge(this.dom, this.stats.sources);
  }

  /** When to use: `human-needed` — a row that waits for the person, not the agent. */
  private onHumanNeeded(event: HumanNeeded): void {
    const row = this.rowFor(`h${event.url}`, '!', event.url, 'Human intervention required');
    row.tier.replaceChildren();
    const badge = document.createElement('span');
    badge.className = 'badge badge-xs badge-error';
    badge.textContent = event.reason;
    row.tier.appendChild(badge);
    row.status.className = 'w-56 text-[10px] text-error';
    row.status.textContent = 'waiting for you in the page…';
    this.log(`human needed · ${event.url} · ${event.reason}`, 'text-error');
  }

  /** When to use: `human-done` — the same row, resolved. */
  private onHumanDone(event: HumanDone): void {
    const row = this.rows.get(`h${event.url}`);
    if (row) {
      row.tier.replaceChildren();
      const badge = document.createElement('span');
      badge.className = 'badge badge-xs badge-success';
      badge.textContent = 'resolved';
      row.tier.appendChild(badge);
      row.status.className = 'w-56 text-[10px] text-success';
      row.status.textContent = 'human completed';
    }
    this.log(`human done · ${event.url}`, 'text-success');
  }

  /** When to use: `activity` — the agent's tool calls, mirrored into the terminal. */
  private onActivity(event: Activity): void {
    if (!this.startedAt) this.startedAt = event.at;
    if (!this.isOpen) setLauncherDot(this.dom, event.status === 'start' ? 'bg-accent animate-pulse' : 'bg-success');
    this.log(
      `${event.tool} ${event.status}${event.status === 'done' ? ` - ${event.ms ?? 0}ms` : ''} - ${event.summary}`,
      event.ok === false ? 'text-error' : 'text-base-content/60',
    );
  }

  /** When to use: `run-done` — final counts win over the incremental ones. */
  private onRunDone(event: RunDone): void {
    this.stopTicker();
    if (this.dom.statusEl) this.dom.statusEl.textContent = 'done';
    if (this.dom.elapsedEl) this.dom.elapsedEl.textContent = `${event.elapsedMs}ms`;
    if (this.dom.escBadge) this.dom.escBadge.textContent = `${event.escalations} esc`;
    this.stats.sources = event.sources;
    this.stats.indexed = event.indexed;
    this.stats.bytes = event.bytes;
    this.stats.humans = event.humans;
    this.stats.anchors = event.anchors;
    this.stats.tiers = { ...event.tiers };
    this.renderStats();
    setLauncherBadge(this.dom, event.sources);
    this.setLauncherState('done');
    this.log(`done · ${event.sources} source(s) · ${event.indexed} indexed`);
  }

  /** When to use: `run-error`. */
  private onRunError(event: RunError): void {
    this.stopTicker();
    if (this.dom.statusEl) this.dom.statusEl.textContent = 'error';
    this.setLauncherState('error');
    this.log(`error · ${event.message}`, 'text-error');
  }
}
