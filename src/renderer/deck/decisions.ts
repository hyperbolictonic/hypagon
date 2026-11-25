/**
 * The DECISIONS tab: the live mirror of what a decision model chose.
 *
 * Why a module: the tab appears only when a backend is configured, the feed is a de-duplicated
 * ring mirror of the main process, and the visibility rule pre-empts the other tabs. All three
 * are one concern, and the settings modal and the HUD both need the visibility rule.
 */
import { switchTab } from './panel-tabs.js';

const tabBtnDecisions = document.getElementById('tab-btn-decisions') as HTMLButtonElement;
const decisionFeed = document.getElementById('decision-feed') as HTMLElement;
const decisionCount = document.getElementById('decision-count') as HTMLElement;
const decisionBackendBadge = document.getElementById('decision-backend-badge') as HTMLElement;

let decisionCalls = 0;
let decisionTabActive = false;
const seenDecisions = new Set<string>();

const decisionKey = (event: any) => `${event.ts}|${event.model}|${event.latencyMs}`;

/** When to use: the status broadcast, a settings save, and the first probe. */
export function setDecisionTabVisible(visible: boolean, status?: any): void {
  tabBtnDecisions.classList.toggle('hidden', !visible);
  decisionBackendBadge.textContent = status?.configured ? `${status.protocol} · ${status.model}` : '—';
  decisionBackendBadge.className = status?.local ? 'badge badge-xs badge-warning' : 'badge badge-xs badge-secondary';

  const tablist = document.querySelector('[role="tablist"]');
  if (visible && tablist && tablist.firstElementChild !== tabBtnDecisions) {
    // First tab while a decision model is active: this is the live view of what it is choosing.
    tablist.prepend(tabBtnDecisions);
  }
  if (visible && !decisionTabActive) {
    decisionTabActive = true;
    switchTab('decisions');
  }
  if (!visible) {
    decisionTabActive = false;
    if (tabBtnDecisions.classList.contains('tab-active')) switchTab('telemetry');
  }
}

/** When to use: after a settings change, and on the slow poll. */
export async function refreshDecisionTab(): Promise<void> {
  try {
    const { status } = await window.electronAPI!.getDecisionSettings();
    setDecisionTabVisible(Boolean(status?.configured), status);
  } catch {
    setDecisionTabVisible(false);
  }
}

function appendDecision(event: any): void {
  const key = decisionKey(event);
  if (seenDecisions.has(key)) return;
  seenDecisions.add(key);
  if (seenDecisions.size > 500) {
    const oldest = seenDecisions.values().next().value;
    if (oldest !== undefined) seenDecisions.delete(oldest);
  }

  decisionCalls++;
  decisionCount.textContent = `${decisionCalls} call${decisionCalls === 1 ? '' : 's'}`;
  decisionFeed.querySelector('.italic')?.remove();

  const row = document.createElement('div');
  row.className = `border-l-2 pl-2 py-1 ${event.ok ? 'border-secondary/60' : 'border-error'}`;

  const head = document.createElement('div');
  head.className = 'text-[10px] text-base-content/50';
  head.textContent = `${new Date(event.ts).toLocaleTimeString()} · ${event.protocol || '?'} · ${event.model || '?'} · ${event.latencyMs ?? '?'}ms`;

  const body = document.createElement('div');
  if (event.ok) {
    const parts = Object.entries(event.answers || {}).map(([key, value]: [string, any]) => {
      if (value && typeof value === 'object') {
        if (typeof value.noul === 'number') return `${key}=${value.noul >= 0.5 ? 'yes' : 'no'} (${value.noul.toFixed(2)})`;
        if (value.choice !== undefined) return `${key}=${value.choice} (${Number(value.confidence ?? 0).toFixed(2)})`;
        if (value.score !== undefined) return `${key}=${value.score} ${value.level ?? ''}`;
      }
      return `${key}=${String(value)}`;
    });
    body.textContent = parts.join(' · ') || '(no answers)';
  } else {
    body.className = 'text-error';
    body.textContent = `${event.error?.code || 'ERROR'} — ${event.error?.message || 'no answer'}`;
  }

  const state = document.createElement('div');
  state.className = 'text-[10px] text-base-content/40 truncate';
  state.textContent = event.statePreview || '';

  row.append(head, body, state);
  decisionFeed.prepend(row);
  while (decisionFeed.children.length > 40) decisionFeed.lastElementChild?.remove();

  // A decision just arrived: the backend must be configured, so reveal the tab even if the
  // last visibility check ran before the config existed.
  if (tabBtnDecisions.classList.contains('hidden')) void refreshDecisionTab();
}

async function syncDecisions(): Promise<void> {
  try {
    const events = await window.electronAPI!.getDecisions();
    (events || []).forEach(appendDecision);
  } catch {}
  await refreshDecisionTab();
}

/** When to use: the HUD boot — subscribe, wire the tab and start the ring-buffer sync. */
export function initDecisions(): void {
  window.electronAPI?.onDecision(appendDecision);
  window.electronAPI?.onDecisionStatus((status) => {
    setDecisionTabVisible(Boolean(status?.configured), status);
  });

  const copyDecisionsBtn = document.getElementById('copy-decisions-btn') as HTMLButtonElement | null;
  copyDecisionsBtn?.addEventListener('click', async () => {
    await window.electronAPI?.copyToClipboard(decisionFeed.innerText);
    copyDecisionsBtn.textContent = 'COPIED';
    setTimeout(() => (copyDecisionsBtn.textContent = 'COPY'), 1200);
  });

  tabBtnDecisions.addEventListener('click', () => switchTab('decisions'));
  tabBtnDecisions.addEventListener('click', () => {
    void syncDecisions();
  });

  // The ring buffer lives in the main process and resets on restart, so re-sync periodically and
  // whenever the tab is opened: a decision made before the window loaded still shows up.
  //
  // The sidebar overlay is a hidden WebContentsView, so gating this on document.visibilityState
  // would stop it from ever re-checking the decision backend. Keep the poll unconditional; it is
  // one small IPC round-trip.
  setInterval(() => {
    void syncDecisions();
  }, 8000);

  void syncDecisions();
  // The sidebar view can load before the decision config probe settles; retry
  // once shortly after startup so its DECISIONS tab appears without waiting for
  // the next poll interval.
  window.setTimeout(() => {
    void refreshDecisionTab();
  }, 1500);
}
