/**
 * The telemetry and logs feed: the pulse list, the log list, the construct renderer and their
 * counters.
 *
 * Owns its elements and state; the entry point pushes events in and reads the last construct for
 * the copy button.
 */
import type { HarvestedConstruct, TelemetryEvent } from '../shared/types.js';
import { cursorTrail } from './cursor-trail';

const statCoords = document.getElementById('stat-coords') as HTMLElement;
const telemetryFeed = document.getElementById('telemetry-feed') as HTMLElement;
const telemetryCount = document.getElementById('telemetry-count') as HTMLElement;
const constructCodeBlock = document.getElementById('construct-code-block') as HTMLElement;
const constructTokenBadge = document.getElementById('construct-token-badge') as HTMLElement;
/** When to use: the copy-logs handler and the log appender. */
export const logsContainer = document.getElementById('logs-container') as HTMLElement;
const logCount = document.getElementById('log-count') as HTMLElement;
let totalTelemetryPulses = 0;
let totalLogEvents = 0;
/** When to use: the copy-construct handler reads the last rendered markdown. */
export let currentConstructMarkdown = '';

/** When to use: a new harvested construct arrived — render it into the CONSTRUCT tab. */
export function renderConstruct(construct: HarvestedConstruct) {
  currentConstructMarkdown = construct.content;
  constructCodeBlock.textContent = construct.content;
  constructTokenBadge.textContent = `~${construct.estimatedTokens} tokens (${(construct.markdownLength / 1024).toFixed(1)} KB)`;
}

// Render Telemetry Event
/** When to use: a telemetry pulse arrived — append it to the feed. */
export function appendTelemetry(event: TelemetryEvent) {
  totalTelemetryPulses++;
  telemetryCount.textContent = totalTelemetryPulses.toString();

  if (event.x !== undefined && event.y !== undefined) {
    cursorTrail.push({ x: event.x, y: event.y, alpha: 1.0 });
    if (cursorTrail.length > 40) cursorTrail.shift();
    statCoords.textContent = `X: ${event.x} Y: ${event.y}`;
  }

  const item = document.createElement('div');
  item.className = 'flex items-center justify-between bg-base-200 px-2 py-1.5 rounded border border-base-300 text-[10px]';

  let badgeColor = 'badge-neutral';
  if (event.type === 'click') badgeColor = 'badge-primary';
  else if (event.type === 'keystroke') badgeColor = 'badge-secondary';
  else if (event.type === 'scroll') badgeColor = 'badge-accent';

  item.innerHTML = `
    <div class="flex items-center gap-1.5 truncate">
      <span class="badge ${badgeColor} badge-xs font-mono uppercase">${event.type}</span>
      <span class="text-base-content/70 truncate">${event.details || ''}</span>
    </div>
    <span class="opacity-40 shrink-0 font-mono">${new Date(event.timestamp).toLocaleTimeString()}</span>
  `;

  if (telemetryFeed.children.length === 1 && telemetryFeed.firstElementChild?.classList.contains('italic')) {
    telemetryFeed.innerHTML = '';
  }

  telemetryFeed.insertBefore(item, telemetryFeed.firstChild);
  if (telemetryFeed.children.length > 30) {
    telemetryFeed.removeChild(telemetryFeed.lastChild!);
  }
}

// Render Log Event
/** When to use: a log line arrived — append it to the LOGS tab. */
export function appendLog(log: { id: string; time: string; level: 'info' | 'warn' | 'action'; message: string }) {
  totalLogEvents++;
  logCount.textContent = `${totalLogEvents} events`;

  const item = document.createElement('div');
  item.className = 'p-1.5 bg-base-200 rounded border border-base-300 flex items-start gap-2 text-[10px] leading-relaxed';

  let levelBadge = '<span class="badge badge-info badge-xs">INFO</span>';
  if (log.level === 'warn') levelBadge = '<span class="badge badge-warning badge-xs">WARN</span>';
  if (log.level === 'action') levelBadge = '<span class="badge badge-accent badge-xs">ACTION</span>';

  item.innerHTML = `
    <span class="shrink-0 text-base-content/40 font-mono">${log.time}</span>
    ${levelBadge}
    <span class="text-base-content/90 font-mono break-all">${log.message}</span>
  `;

  if (logsContainer.children.length === 1 && logsContainer.firstElementChild?.classList.contains('italic')) {
    logsContainer.innerHTML = '';
  }

  logsContainer.insertBefore(item, logsContainer.firstChild);
  // A long-running packaged session emits an entry for every bridge call. Keep
  // the HUD bounded; an unbounded DOM was a slow renderer-memory leak.
  while (logsContainer.children.length > 200) {
    logsContainer.lastElementChild?.remove();
  }
}
