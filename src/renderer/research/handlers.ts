/**
 * Rendering one research event: the surface the agent also sees.
 *
 * Why a module: the panel used to fold nine event types, the run clock and the table into
 * one 452-line function. Each event is now a handler over the collaborators, so a tier
 * escalation or a human hand-off reads on its own.
 */
import type { ResearchEvent } from '../../shared/research-events.js';
import type { ResearchChrome } from './chrome.js';
import type { ResearchElements } from './elements.js';
import type { ResearchLog } from './log-view.js';
import type { ResearchStats } from './stats.js';
import type { SourceRow, SourceRows } from './rows.js';

type RunStart = Extract<ResearchEvent, { type: 'run-start' }>;
type SearchDone = Extract<ResearchEvent, { type: 'search-done' }>;
type SourceStart = Extract<ResearchEvent, { type: 'source-start' }>;
type SourceDone = Extract<ResearchEvent, { type: 'source-done' }>;
type HumanNeeded = Extract<ResearchEvent, { type: 'human-needed' }>;
type HumanDone = Extract<ResearchEvent, { type: 'human-done' }>;
type Activity = Extract<ResearchEvent, { type: 'activity' }>;
type RunDone = Extract<ResearchEvent, { type: 'run-done' }>;
type RunError = Extract<ResearchEvent, { type: 'run-error' }>;

/** When to use: `applyResearchEvent` — the panel's collaborators and the run clock. */
export interface ResearchContext {
  elements: ResearchElements;
  chrome: ResearchChrome;
  log: ResearchLog;
  stats: ResearchStats;
  rows: SourceRows;
  /** How many sources escalated in this run (the launcher tone and the esc badge). */
  escalations: { count: number };
  /** The elapsed-time ticker id, so a finished run stops it. */
  ticker: { id: number | undefined };
}

/** Append a small note under a row's status. */
function appendNote(target: HTMLElement, text: string, className: string): void {
  const note = document.createElement('div');
  note.className = className;
  note.textContent = text;
  target.appendChild(note);
}

/** Start the elapsed-time ticker at 100ms. */
function startTicker(ctx: ResearchContext): void {
  stopTicker(ctx);
  const startedAt = Date.now();
  ctx.ticker.id = window.setInterval(() => {
    if (ctx.elements.elapsed) ctx.elements.elapsed.textContent = `${Date.now() - startedAt}ms`;
  }, 100);
}

/** Stop the elapsed-time ticker. */
export function stopTicker(ctx: ResearchContext): void {
  if (ctx.ticker.id !== undefined) {
    window.clearInterval(ctx.ticker.id);
    ctx.ticker.id = undefined;
  }
}

/** When to use: a new run — clear the surface, zero the counters and start the clock. */
export function beginRun(ctx: ResearchContext): void {
  ctx.rows.reset();
  ctx.log.reset();
  ctx.stats.reset();
  ctx.escalations.count = 0;
  if (ctx.elements.escalations) ctx.elements.escalations.textContent = '0 esc';
  if (ctx.elements.status) ctx.elements.status.textContent = 'running';
  ctx.chrome.setBadge(0);
  ctx.chrome.setState('running');
  startTicker(ctx);
}

/** When to use: an event from `onResearchEvent`. */
export function applyResearchEvent(ctx: ResearchContext, event: ResearchEvent): void {
  switch (event.type) {
    case 'run-start':
      return onRunStart(ctx, event);
    case 'search-done':
      return onSearchDone(ctx, event);
    case 'source-start':
      return onSourceStart(ctx, event);
    case 'source-done':
      return onSourceDone(ctx, event);
    case 'human-needed':
      return onHumanNeeded(ctx, event);
    case 'human-done':
      return onHumanDone(ctx, event);
    case 'activity':
      return onActivity(ctx, event);
    case 'run-done':
      return onRunDone(ctx, event);
    case 'run-error':
      return onRunError(ctx, event);
  }
}

/** A run began: take the screen, clear it and log the query. */
function onRunStart(ctx: ResearchContext, event: RunStart): void {
  void ctx.chrome.show();
  beginRun(ctx);
  ctx.log.write(`run ${event.runId.slice(0, 8)} · ${event.query}`);
}

/** The search finished (or a provider blocked it — that must not look like success). */
function onSearchDone(ctx: ResearchContext, event: SearchDone): void {
  ctx.log.write(
    `search ${event.engine ?? '?'} · ${event.results} result(s)` + (event.blocked ? ' · provider blocked' : ''),
    event.blocked ? 'text-warning' : undefined,
  );
}

/** A source was found: create its row early so the table fills as the crawl runs. */
function onSourceStart(ctx: ResearchContext, event: SourceStart): void {
  ctx.rows.rowFor(`s${event.rank}`, `#${event.rank}`, event.url, event.title);
}

/** A source finished: tier badge, numbers, status, human/anchor/escalation notes. */
function onSourceDone(ctx: ResearchContext, event: SourceDone): void {
  const row = ctx.rows.rowFor(`s${event.rank}`, `#${event.rank}`, event.url, event.title);
  applyOutcome(ctx, row, event);

  if (event.humanAssisted) {
    appendNote(row.status, `human-assisted (${Math.round((event.humanMs ?? 0) / 1000)}s)`, 'text-[9px] text-error mt-0.5');
  }
  if (event.anchors) {
    appendNote(row.status, `${event.anchors} anchor(s)`, 'text-[9px] text-base-content/40 mt-0.5');
  }

  row.anchors = event.anchorDetails;
  if (event.anchorDetails?.length) ctx.rows.appendCitationCheck(row);

  if (event.escalation) {
    ctx.escalations.count++;
    if (ctx.elements.escalations) ctx.elements.escalations.textContent = `${ctx.escalations.count} esc`;
    appendNote(row.status, `← ${event.escalation.from}: ${event.escalation.reason}`, 'text-[9px] text-warning mt-0.5');
    ctx.log.write(`ESCALATED ${event.url} · ${event.escalation.reason}`, 'text-warning');
  }

  ctx.stats.addSource(event, ctx.rows.count());
  ctx.chrome.setBadge(ctx.stats.sourceCount);
}

/** The tier badge, the byte/time/highlight numbers and the status text for one row. */
function applyOutcome(ctx: ResearchContext, row: SourceRow, event: SourceDone): void {
  ctx.rows.setBadge(row, event.via, ctx.rows.tierBadgeFor(event.via));

  row.kb.textContent = (event.bytes / 1024).toFixed(1);
  row.ms.textContent = String(event.ms);
  row.hl.textContent = String(event.highlights);
  row.hl.className = `w-10 text-right tabular-nums ${event.highlights > 0 ? 'text-base-content' : 'text-base-content/30'}`;

  row.status.className = `w-56 text-[10px] ${event.error ? 'text-error' : 'text-base-content/50'}`;
  row.status.textContent = event.error ? `error · ${event.error}` : event.indexed ? 'indexed' : 'ok';
}

/** A page needs a human: a distinct row so it cannot be mistaken for a source. */
function onHumanNeeded(ctx: ResearchContext, event: HumanNeeded): void {
  const row = ctx.rows.rowFor(`h${event.url}`, '!', event.url, 'Human intervention required');
  ctx.rows.setBadge(row, event.reason, 'badge-error');
  row.status.className = 'w-56 text-[10px] text-error';
  row.status.textContent = 'waiting for you in the page…';
  ctx.log.write(`human needed · ${event.url} · ${event.reason}`, 'text-error');
}

/** The human finished: mark the same row resolved. */
function onHumanDone(ctx: ResearchContext, event: HumanDone): void {
  const row = ctx.rows.get(`h${event.url}`);
  if (row) {
    ctx.rows.setBadge(row, 'resolved', 'badge-success');
    row.status.className = 'w-56 text-[10px] text-success';
    row.status.textContent = 'human completed';
  }
  ctx.log.write(`human done · ${event.url}`, 'text-success');
}

/** Agent activity: the same lines the agent receives, plus the launcher dot when closed. */
function onActivity(ctx: ResearchContext, event: Activity): void {
  ctx.log.start(event.at);
  if (!ctx.chrome.isOpen) ctx.chrome.setState(event.status === 'start' ? 'running' : 'done');
  ctx.log.write(
    `${event.tool} ${event.status}${event.status === 'done' ? ` - ${event.ms ?? 0}ms` : ''} - ${event.summary}`,
    event.ok === false ? 'text-error' : 'text-base-content/60',
  );
}

/** The run finished: the summary is authoritative for the stats strip. */
function onRunDone(ctx: ResearchContext, event: RunDone): void {
  stopTicker(ctx);
  if (ctx.elements.status) ctx.elements.status.textContent = 'done';
  if (ctx.elements.elapsed) ctx.elements.elapsed.textContent = `${event.elapsedMs}ms`;
  if (ctx.elements.escalations) ctx.elements.escalations.textContent = `${event.escalations} esc`;
  ctx.stats.setFinal(event);
  ctx.chrome.setBadge(event.sources);
  ctx.chrome.setState('done', ctx.escalations.count > 0);
  ctx.log.write(`done · ${event.sources} source(s) · ${event.indexed} indexed`);
}

/** The run failed. */
function onRunError(ctx: ResearchContext, event: RunError): void {
  stopTicker(ctx);
  if (ctx.elements.status) ctx.elements.status.textContent = 'error';
  ctx.chrome.setState('error');
  ctx.log.write(`error · ${event.message}`, 'text-error');
}
