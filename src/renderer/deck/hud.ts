/**
 * The HUD's two feeds and the construct preview: telemetry pulses, the log, and the harvested
 * markdown.
 *
 * Why a module: three renderers with their own counters and caps, plus the buttons that switch
 * the lower panel to them. The boot module only subscribes them.
 */
import type { HarvestedConstruct, TelemetryEvent } from '../../shared/types.js';
import { switchTab } from './panel-tabs.js';
import { pushTrailPoint } from './trail.js';
import { refreshWebState } from './webstate.js';

const statCoords = document.getElementById('stat-coords') as HTMLElement;
const statTokens = document.getElementById('stat-tokens') as HTMLElement;
const statInteractions = document.getElementById('stat-interactions') as HTMLElement;

const tabBtnTelemetry = document.getElementById('tab-btn-telemetry') as HTMLButtonElement;
const tabBtnConstruct = document.getElementById('tab-btn-construct') as HTMLButtonElement;
const tabBtnLogs = document.getElementById('tab-btn-logs') as HTMLButtonElement;

const telemetryFeed = document.getElementById('telemetry-feed') as HTMLElement;
const telemetryCount = document.getElementById('telemetry-count') as HTMLElement;
const constructCodeBlock = document.getElementById('construct-code-block') as HTMLElement;
const constructTokenBadge = document.getElementById('construct-token-badge') as HTMLElement;
const logsContainer = document.getElementById('logs-container') as HTMLElement;
const logCount = document.getElementById('log-count') as HTMLElement;

const harvestBtn = document.getElementById('harvest-btn') as HTMLButtonElement;
const copyConstructBtn = document.getElementById('copy-construct-btn') as HTMLButtonElement;

let totalTelemetryPulses = 0;
let totalLogEvents = 0;
let currentConstructMarkdown = '';

/** When to use: `getLatestConstruct` and a harvested construct. */
export function renderConstruct(construct: HarvestedConstruct): void {
  currentConstructMarkdown = construct.content;
  constructCodeBlock.textContent = construct.content;
  constructTokenBadge.textContent = `~${construct.estimatedTokens} tokens (${(construct.markdownLength / 1024).toFixed(1)} KB)`;
}

/** When to use: a telemetry event from the bridge. */
export function appendTelemetry(event: TelemetryEvent): void {
  totalTelemetryPulses++;
  telemetryCount.textContent = totalTelemetryPulses.toString();

  if (event.x !== undefined && event.y !== undefined) {
    pushTrailPoint(event.x, event.y);
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

/** When to use: a log event (the panel and `getLogs` both replay them here). */
export function appendLog(log: { id: string; time: string; level: 'info' | 'warn' | 'action'; message: string }): void {
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

/** When to use: Ctrl+H — the same path as the HARVEST button. */
export function clickHarvest(): void {
  harvestBtn.click();
}

/** When to use: the HUD boot — wire the tabs, the copy buttons and the harvest action. */
export function initHud(): void {
  tabBtnTelemetry.addEventListener('click', () => switchTab('telemetry'));
  tabBtnConstruct.addEventListener('click', () => switchTab('construct'));
  tabBtnLogs.addEventListener('click', () => {
    switchTab('logs');
    void refreshWebState();
  });

  // One-click copy for the HUD panels: selection + Ctrl+C is unreliable when a native menu or the
  // browsing view owns focus, and the construct panel already had a COPY button of its own.
  const copyLogsBtn = document.getElementById('copy-logs-btn') as HTMLButtonElement | null;
  copyLogsBtn?.addEventListener('click', async () => {
    await window.electronAPI?.copyToClipboard(logsContainer.innerText);
    copyLogsBtn.textContent = 'COPIED';
    setTimeout(() => (copyLogsBtn.textContent = 'COPY'), 1200);
  });

  copyConstructBtn.addEventListener('click', async () => {
    if (!currentConstructMarkdown) return;
    await navigator.clipboard.writeText(currentConstructMarkdown);
    const prevText = copyConstructBtn.innerText;
    copyConstructBtn.innerText = 'COPIED!';
    setTimeout(() => {
      copyConstructBtn.innerText = prevText;
    }, 1500);
  });

  harvestBtn.addEventListener('click', async () => {
    if (!window.electronAPI) return;
    const icon = document.getElementById('harvest-icon');
    const spinner = document.getElementById('harvest-spinner');
    harvestBtn.disabled = true;
    icon?.classList.add('hidden');
    spinner?.classList.remove('hidden');
    try {
      const construct = await window.electronAPI.harvest();
      renderConstruct(construct);
      switchTab('construct');
    } finally {
      harvestBtn.disabled = false;
      spinner?.classList.add('hidden');
      icon?.classList.remove('hidden');
    }
  });
}

/** When to use: `updateState` — the two token/interaction counters. */
export function renderStats(stats: { tokensHarvested: number; totalInteractions: number }): void {
  statTokens.textContent = `${stats.tokensHarvested.toLocaleString()} tkn`;
  statInteractions.textContent = `${stats.totalInteractions} interactions`;
}
