import type { ElectronAPI } from '../preload/index.js';
import type { ChassisState, HarvestedConstruct, TelemetryEvent } from '../shared/types.js';
import type { ZoomState } from '../shared/zoom.js';
import { BRAND } from '../shared/brand.js';
import { beginRecording, finishRecording } from './recording';
import { refreshToolsPanel } from './tools-panel';
import { initResearchPanel } from './research-panel';
import { initViewportControls } from './viewport-controls';
import { bootMenuPopup } from './menu-popup';
import { initCortexPanel, updateActivePage } from './cortex-panel';
import { initRemotePanel, loadRemotePanel } from './settings-remote';
import { initConnectPanel, loadConnectPanel } from './settings-clients';
import { initMediaPanel, loadMediaSettings } from './settings-media';
import { showAlert, validationMessage } from './settings-alert';
import { closeWrapWrapperModal, loadWrapWrappers } from './settings-wrap-wrappers';
import { activeWrapTab, initWrapSecrets, loadWrapSettings } from './settings-wrap-secrets';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const MENU_POPUP_MODE = new URLSearchParams(window.location.search).has('menupopup');
if (MENU_POPUP_MODE) bootMenuPopup();

// UI Elements
const urlForm = document.getElementById('url-form') as HTMLFormElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const viewportUrlDisplay = document.getElementById('viewport-url-display') as HTMLElement;
const viewportLoadingSpinner = document.getElementById('viewport-loading-spinner') as HTMLElement;
const agentStatusBadge = document.getElementById('agent-status-badge') as HTMLElement;
const resumeAgentBtn = document.getElementById('resume-agent-btn') as HTMLButtonElement | null;
const takeOverBtn = document.getElementById('take-over-btn') as HTMLButtonElement | null;
const activeActionText = document.getElementById('active-action-text') as HTMLElement;

resumeAgentBtn?.addEventListener('click', async () => {
  if (!resumeAgentBtn) return;
  resumeAgentBtn.disabled = true;
  try {
    const result = await window.electronAPI?.resumeAgent();
    if (!result?.ok) {
      activeActionText.textContent = result?.error || 'Could not resume the agent.';
      return;
    }
    resumeAgentBtn.classList.add('hidden');
    activeActionText.textContent = 'Human takeover cleared — agent may act again';
  } catch (error: any) {
    activeActionText.textContent = `Could not resume the agent: ${error?.message || error}`;
  } finally {
    resumeAgentBtn.disabled = false;
  }
});
takeOverBtn?.addEventListener('click', async () => {
  if (!takeOverBtn) return;
  takeOverBtn.disabled = true;
  try {
    const result = await window.electronAPI?.takeOverAgent();
    if (!result?.ok) activeActionText.textContent = result?.error || 'Could not take control.';
  } catch (error: any) {
    activeActionText.textContent = `Could not take control: ${error?.message || error}`;
  } finally {
    takeOverBtn.disabled = false;
  }
});
const harvestBtn = document.getElementById('harvest-btn') as HTMLButtonElement;
const copyConstructBtn = document.getElementById('copy-construct-btn') as HTMLButtonElement;
const chassisVersionBadge = document.getElementById('chassis-version');
const aboutVersion = document.getElementById('about-version');
const zoomOutBtn = document.getElementById('zoom-out-btn') as HTMLButtonElement | null;
const zoomInBtn = document.getElementById('zoom-in-btn') as HTMLButtonElement | null;
const zoomLevelBtn = document.getElementById('zoom-level-btn') as HTMLButtonElement | null;

function renderAppVersion(version: string | undefined) {
  if (!version) return;
  if (chassisVersionBadge) chassisVersionBadge.textContent = `v${version}`;
  if (aboutVersion) aboutVersion.textContent = `v${version}`;
  document.title = `${BRAND.product} v${version}`;
}

void window.electronAPI
  ?.getConnectInfo?.()
  .then((info) => renderAppVersion(info?.version))
  .catch(() => undefined);

// Stat elements
const statCoords = document.getElementById('stat-coords') as HTMLElement;
const statVelocity = document.getElementById('stat-velocity') as HTMLElement;
const statTokens = document.getElementById('stat-tokens') as HTMLElement;
const statInteractions = document.getElementById('stat-interactions') as HTMLElement;

// Tabs
const tabBtnTelemetry = document.getElementById('tab-btn-telemetry') as HTMLButtonElement;
const tabBtnConstruct = document.getElementById('tab-btn-construct') as HTMLButtonElement;
const tabBtnLogs = document.getElementById('tab-btn-logs') as HTMLButtonElement;

const tabContentTelemetry = document.getElementById('tab-content-telemetry') as HTMLElement;
const tabContentConstruct = document.getElementById('tab-content-construct') as HTMLElement;
const tabContentLogs = document.getElementById('tab-content-logs') as HTMLElement;
const tabBtnDecisions = document.getElementById('tab-btn-decisions') as HTMLButtonElement;
const tabContentDecisions = document.getElementById('tab-content-decisions') as HTMLElement;
const decisionFeed = document.getElementById('decision-feed') as HTMLElement;
const decisionCount = document.getElementById('decision-count') as HTMLElement;
const decisionBackendBadge = document.getElementById('decision-backend-badge') as HTMLElement;
let decisionCalls = 0;

// Dynamic Lists & Preview
const telemetryFeed = document.getElementById('telemetry-feed') as HTMLElement;
const telemetryCount = document.getElementById('telemetry-count') as HTMLElement;
const constructCodeBlock = document.getElementById('construct-code-block') as HTMLElement;
const constructTokenBadge = document.getElementById('construct-token-badge') as HTMLElement;
const logsContainer = document.getElementById('logs-container') as HTMLElement;
const logCount = document.getElementById('log-count') as HTMLElement;

// Radar Canvas for Cursor Tracking
const canvas = document.getElementById('radar-canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
const cursorTrail: Array<{ x: number; y: number; alpha: number }> = [];

let totalTelemetryPulses = 0;
let totalLogEvents = 0;
let currentConstructMarkdown = '';

function resizeCanvas() {
  if (!canvas || !canvas.parentElement) return;
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// ---- Native floating Cyberdeck panel ------------------------------------------------------
// The panel is rendered in its own WebContentsView (`?sidebar=1`) so it can sit
// above the native browser view. The main window keeps this DOM copy hidden.
const SIDEBAR_MODE = new URLSearchParams(window.location.search).has('sidebar');
document.documentElement.classList.toggle('sidebar-mode', SIDEBAR_MODE);

const sidebarPanel = document.getElementById('sidebar-panel') as HTMLElement | null;
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') as HTMLButtonElement | null;
const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn') as HTMLButtonElement | null;
const sidebarDockBtn = document.getElementById('sidebar-dock-btn') as HTMLButtonElement | null;
const sidebarRailToggle = document.getElementById('sidebar-rail-toggle') as HTMLButtonElement | null;
type SidebarMode = 'docked' | 'floating' | 'collapsed';
let currentSidebarMode: SidebarMode = 'floating';

function applySidebarMode(mode: SidebarMode): void {
  currentSidebarMode = mode;
  document.documentElement.classList.toggle('sidebar-collapsed', mode === 'collapsed');
  document.documentElement.classList.toggle('sidebar-docked', mode === 'docked');
  document.documentElement.classList.toggle('sidebar-floating', mode === 'floating');

  // Direct DOM fallback in addition to the CSS mode classes: the native view
  // may receive this before its stylesheet has settled.
  sidebarPanel?.classList.toggle('hidden', mode === 'collapsed');
  if (sidebarRailToggle) {
    sidebarRailToggle.style.display = mode === 'collapsed' ? 'flex' : 'none';
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.textContent = mode === 'collapsed' ? '◨' : '◧';
    sidebarToggleBtn.title =
      mode === 'collapsed'
        ? 'Show the Command Deck (Ctrl+Shift+B)'
        : 'Collapse the Command Deck (Ctrl+Shift+B)';
  }

  if (sidebarDockBtn) {
    sidebarDockBtn.textContent = mode === 'docked' ? 'FLOAT' : 'DOCK';
    sidebarDockBtn.disabled = mode === 'collapsed';
  }
}

function toggleSidebar(): void {
  window.electronAPI?.toggleSidebarMode();
}

sidebarToggleBtn?.addEventListener('click', toggleSidebar);
sidebarCollapseBtn?.addEventListener('click', () => {
  // Apply locally first so the panel gives immediate feedback even if the
  // native bounds update is delayed.
  applySidebarMode('collapsed');
  window.electronAPI?.setSidebarMode('collapsed');
});
sidebarDockBtn?.addEventListener('click', () => {
  const target: SidebarMode = currentSidebarMode === 'docked' ? 'floating' : 'docked';
  applySidebarMode(target);
  window.electronAPI?.setSidebarMode(target);
});
// ---- Deck orb: click restores the deck, press-and-move drags it ----
function applySidebarState(state: {
  mode: 'docked' | 'floating' | 'collapsed';
  collabMode: boolean;
  collabEnabled: boolean;
  orbEdge: 'left' | 'right';
}): void {
  applySidebarMode(state.mode);
  document.documentElement.classList.toggle('collab-mode', state.collabMode && state.mode === 'collapsed');
  document.documentElement.classList.toggle('collab-disabled', state.collabEnabled === false);
  collabModeOn = state.collabMode && state.mode === 'collapsed';
  const collabButton = document.getElementById('collab-btn');
  collabButton?.classList.toggle('btn-warning', collabModeOn);
  collabButton?.classList.toggle('btn-ghost', !collabModeOn);
  collabButton?.classList.toggle('text-accent', !collabModeOn);
  collabButton?.setAttribute('aria-pressed', String(collabModeOn));
  sidebarRailToggle?.classList.toggle('orb-left', state.orbEdge === 'left');
  try {
    localStorage.setItem('deck.orb-edge', state.orbEdge);
  } catch {
    /* storage unavailable */
  }
}

sidebarRailToggle?.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const hub = event.currentTarget as HTMLElement;
  // Synthetic pointers (tests, automation) have no active id: ignore the failure.
  try {
    hub.setPointerCapture(event.pointerId);
  } catch {
    /* capture unavailable */
  }
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  const onMove = (moveEvent: PointerEvent) => {
    if (!dragging) {
      if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) <= 6) return;
      dragging = true;
      hub.classList.add('orb-dragging');
    }
    window.electronAPI?.orbitDragMove(moveEvent.movementX, moveEvent.movementY);
  };
  const onUp = () => {
    hub.classList.remove('orb-dragging');
    hub.removeEventListener('pointermove', onMove);
    hub.removeEventListener('pointerup', onUp);
    hub.removeEventListener('pointercancel', onUp);
    if (dragging) {
      dragging = false;
      window.electronAPI?.orbitDragEnd();
      return;
    }
    window.electronAPI?.setSidebarMode('floating');
  };
  hub.addEventListener('pointermove', onMove);
  hub.addEventListener('pointerup', onUp);
  hub.addEventListener('pointercancel', onUp);
});
sidebarRailToggle?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    window.electronAPI?.setSidebarMode('floating');
  }
});

// ---- Collab-mode toolbar: [(‹) prev] [(›) next] [list] [pen] [ESC] ------------
document.getElementById('collab-btn')?.addEventListener('click', () => window.electronAPI?.setCollabMode(true));
document.getElementById('collab-prev-btn')?.addEventListener('click', () => window.electronAPI?.collabNavigate(-1));
document.getElementById('collab-next-btn')?.addEventListener('click', () => window.electronAPI?.collabNavigate(1));
document.getElementById('collab-list-btn')?.addEventListener('click', () => window.electronAPI?.collabToggleList());
document.getElementById('collab-pick-btn')?.addEventListener('click', () => void window.electronAPI?.startCollaborationPicker());
document.getElementById('collab-exit-btn')?.addEventListener('click', () => window.electronAPI?.setCollabMode(false));
let collabModeOn = false;
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (document.activeElement instanceof HTMLInputElement) return;
  if (document.activeElement instanceof HTMLTextAreaElement) return;
  // Deck focus owns Escape while the note picker/toolbar is in play.
  if (collabModeOn) window.electronAPI?.setCollabMode(false);
  else window.electronAPI?.escapeCollabUi();
});

// Orb status lights (the docked side is handled by applySidebarState).
window.electronAPI?.onRecordingStatus((state: unknown) => {
  sidebarRailToggle?.classList.toggle('is-recording', Boolean((state as { recording?: boolean })?.recording));
});

/** Experimental flag UI: hide collab entry points unless the flag is on. */
function applyExperimentalSettings(settings: { collab?: boolean } | null | undefined): void {
  const collabEnabled = settings?.collab === true;
  document.documentElement.classList.toggle('collab-disabled', !collabEnabled);
  const toggle = document.getElementById('settings-experimental-collab') as HTMLInputElement | null;
  if (toggle) toggle.checked = collabEnabled;
  const status = document.getElementById('settings-experimental-status');
  if (status) {
    status.textContent = collabEnabled
      ? 'ON — collab entry points are visible'
      : 'OFF — collab entry points are hidden';
  }
  for (const id of ['collab-count', 'deck-orb-count']) {
    if (!collabEnabled) document.getElementById(id)?.classList.add('hidden');
  }
  if (collabEnabled) void refreshCollaborationCount();
}
window.electronAPI?.onExperimentalSettings((settings) => applyExperimentalSettings(settings));
void window.electronAPI
  ?.getExperimentalSettings?.()
  .then((result) => applyExperimentalSettings(result?.settings))
  .catch(() => undefined);
document.getElementById('settings-experimental-collab')?.addEventListener('change', async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const result = await window.electronAPI?.saveExperimentalSettings({ collab: input.checked });
  if (result?.ok) {
    applyExperimentalSettings(result.settings);
  } else {
    input.checked = !input.checked;
  }
});

async function refreshCollaborationCount(): Promise<void> {
  const result = await window.electronAPI?.listCollaborationThreads({});
  if (!result?.ok) return;
  const openCount = (result.threads || []).filter((thread) => thread.status !== 'resolved').length;
  for (const id of ['collab-count', 'deck-orb-count']) {
    const badge = document.getElementById(id);
    if (!badge) continue;
    badge.textContent = String(openCount);
    badge.classList.toggle('hidden', openCount === 0);
  }
}
window.electronAPI?.onCollaborationUpdated(() => void refreshCollaborationCount());
void refreshCollaborationCount();

const hilToast = document.getElementById('hil-toast');
const hilToastReason = document.getElementById('hil-toast-reason');
const hilToastResume = document.getElementById('hil-toast-resume');
const hilToastCancel = document.getElementById('hil-toast-cancel');
const hilToastReload = document.getElementById('hil-toast-reload');

window.electronAPI?.onHilRequested((request) => {
  sidebarRailToggle?.classList.add('is-hil');
  if (hilToast && hilToastReason) {
    hilToastReason.textContent = request?.reason || 'Human intervention required';
    hilToast.classList.remove('hidden');
  }
});
window.electronAPI?.onHilCleared(() => {
  sidebarRailToggle?.classList.remove('is-hil');
  hilToast?.classList.add('hidden');
});
hilToastResume?.addEventListener('click', () => {
  void window.electronAPI?.resolveHil();
});
hilToastCancel?.addEventListener('click', () => {
  void window.electronAPI?.cancelHil();
});
hilToastReload?.addEventListener('click', () => {
  void window.electronAPI?.reloadHil();
});
try {
  const savedEdge = localStorage.getItem('deck.orb-edge');
  if (savedEdge === 'left' || savedEdge === 'right') {
    window.electronAPI?.setSidebarOrbEdge(savedEdge);
  }
} catch {
  /* storage unavailable */
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    toggleSidebar();
  }
});

// Paint the overlay in its intended translucent state before the async mode
// round-trip. If the main process reports docked/collapsed, the response
// replaces this immediately.
if (SIDEBAR_MODE) applySidebarMode('floating');
window.electronAPI?.getSidebarState?.().then(applySidebarState).catch(() => undefined);
window.electronAPI?.onSidebarState(applySidebarState);
resizeCanvas();

// Render loop for organic Ghost Cursor trail
function renderTrail() {
  if (SIDEBAR_MODE || MENU_POPUP_MODE || !ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = cursorTrail.length - 1; i >= 0; i--) {
    const pt = cursorTrail[i];
    pt.alpha -= 0.02;

    if (pt.alpha <= 0) {
      cursorTrail.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0, 210, 255, ${pt.alpha})`;
    ctx.shadowColor = '#00d2ff';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  // Draw connecting line between last points
  if (cursorTrail.length > 1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cursorTrail[0].x, cursorTrail[0].y);
    for (let i = 1; i < cursorTrail.length; i++) {
      ctx.lineTo(cursorTrail[i].x, cursorTrail[i].y);
    }
    ctx.strokeStyle = 'rgba(0, 210, 255, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  requestAnimationFrame(renderTrail);
}
requestAnimationFrame(renderTrail);

// Tab switching
function switchTab(activeTab: 'telemetry' | 'construct' | 'logs' | 'decisions') {
  tabBtnTelemetry.classList.toggle('tab-active', activeTab === 'telemetry');
  tabBtnConstruct.classList.toggle('tab-active', activeTab === 'construct');
  tabBtnLogs.classList.toggle('tab-active', activeTab === 'logs');
  tabBtnDecisions.classList.toggle('tab-active', activeTab === 'decisions');

  tabContentTelemetry.classList.toggle('hidden', activeTab !== 'telemetry');
  tabContentConstruct.classList.toggle('hidden', activeTab !== 'construct');
  tabContentLogs.classList.toggle('hidden', activeTab !== 'logs');
  tabContentDecisions.classList.toggle('hidden', activeTab !== 'decisions');

  tabContentConstruct.classList.toggle('flex', activeTab === 'construct');
  tabContentLogs.classList.toggle('flex', activeTab === 'logs');
  tabContentDecisions.classList.toggle('flex', activeTab === 'decisions');
}

tabBtnTelemetry.addEventListener('click', () => switchTab('telemetry'));
tabBtnConstruct.addEventListener('click', () => switchTab('construct'));
tabBtnLogs.addEventListener('click', () => {
  switchTab('logs');
  void refreshWebState();
});

initResearchPanel();
initViewportControls();
initCortexPanel({ appendLog });
initRemotePanel();
initConnectPanel();
initMediaPanel();
initWrapSecrets();

// ---- WEB STATE: breadcrumbs, cookies, localStorage/sessionStorage ----------
async function refreshWebState(): Promise<void> {
  const target = document.getElementById('webstate-view');
  if (!target) return;
  const result = await window.electronAPI?.getWebState();
  if (!result?.ok || !result.state) {
    target.textContent = result?.error || 'Web state unavailable — the deck needs an active page.';
    return;
  }
  const s = result.state;
  target.replaceChildren();

  const section = (heading: string): HTMLElement => {
    const head = document.createElement('div');
    head.className = 'text-[10px] uppercase tracking-wider text-base-content/45 mt-1';
    head.textContent = heading;
    target.append(head);
    return head;
  };
  const row = (value: string, klass = 'text-base-content/80 break-all'): void => {
    const el = document.createElement('div');
    el.className = klass;
    el.textContent = value;
    target.append(el);
  };

  section('URL');
  row(s.url, 'text-accent break-all');
  if (s.title) row('“' + s.title + '”', 'text-base-content/60');
  if (s.crumbs.length) {
    section('Crumbs');
    row(s.crumbs.join('  ›  '), 'text-base-content/70');
  }
  section('Cookies (' + s.cookies.length + ')');
  if (s.cookies.length) {
    const wrap = document.createElement('div');
    wrap.className = 'flex flex-wrap gap-1';
    for (const cookie of s.cookies) {
      const chip = document.createElement('span');
      chip.className = 'px-1.5 py-0.5 rounded border border-base-300 bg-base-200/50';
      chip.textContent = cookie.name + (cookie.httpOnly ? ' ⚿' : '');
      chip.title = cookie.domain + (cookie.httpOnly ? ' · httpOnly' : '');
      wrap.append(chip);
    }
    target.append(wrap);
  } else {
    row('none visible', 'text-base-content/40');
  }
  section('Local storage (' + Object.keys(s.local).length + ')');
  const localKeys = Object.keys(s.local);
  if (localKeys.length) {
    for (const key of localKeys.slice(0, 12)) {
      row(key + ' = ' + (s.local[key] || '""'), 'text-base-content/70 break-all');
    }
    if (localKeys.length > 12) row('… ' + (localKeys.length - 12) + ' more', 'text-base-content/35');
  } else {
    row('empty', 'text-base-content/40');
  }
  section('Session storage (' + Object.keys(s.session).length + ')');
  const sessionKeys = Object.keys(s.session);
  if (sessionKeys.length) {
    for (const key of sessionKeys.slice(0, 12)) {
      row(key + ' = ' + (s.session[key] || '""'), 'text-base-content/70 break-all');
    }
    if (sessionKeys.length > 12) row('… ' + (sessionKeys.length - 12) + ' more', 'text-base-content/35');
  } else {
    row('empty', 'text-base-content/40');
  }
}

document.getElementById('webstate-refresh-btn')?.addEventListener('click', () => void refreshWebState());
document.getElementById('webstate-events-toggle')?.addEventListener('click', (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const events = document.getElementById('webstate-events');
  const open = Boolean(events?.classList.contains('hidden'));
  events?.classList.toggle('hidden', !open);
  button.setAttribute('aria-expanded', String(open));
});
tabBtnDecisions.addEventListener('click', () => switchTab('decisions'));

// ---- Decision model mirror (tab appears only when a backend is configured) -------------------
let decisionTabActive = false;
function setDecisionTabVisible(visible: boolean, status?: any) {
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

async function refreshDecisionTab() {
  try {
    const { status } = await window.electronAPI!.getDecisionSettings();
    setDecisionTabVisible(Boolean(status?.configured), status);
  } catch {
    setDecisionTabVisible(false);
  }
}

const seenDecisions = new Set<string>();
const decisionKey = (event: any) => `${event.ts}|${event.model}|${event.latencyMs}`;

function appendDecision(event: any) {
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

window.electronAPI?.onDecision(appendDecision);
window.electronAPI?.onDecisionStatus((status) => {
  setDecisionTabVisible(Boolean(status?.configured), status);
});

// The ring buffer lives in the main process and resets on restart, so re-sync periodically and
// whenever the tab is opened: a decision made before the window loaded still shows up.
async function syncDecisions() {
  try {
    const events = await window.electronAPI!.getDecisions();
    (events || []).forEach(appendDecision);
  } catch {}
  await refreshDecisionTab();
}

tabBtnDecisions.addEventListener('click', () => {
  void syncDecisions();
});

// One-click copy for the HUD panels: selection + Ctrl+C is unreliable when a native menu or the
// browsing view owns focus, and the construct panel already had a COPY button of its own.
const copyLogsBtn = document.getElementById('copy-logs-btn') as HTMLButtonElement | null;
copyLogsBtn?.addEventListener('click', async () => {
  await window.electronAPI?.copyToClipboard(logsContainer.innerText);
  copyLogsBtn.textContent = 'COPIED';
  setTimeout(() => (copyLogsBtn.textContent = 'COPY'), 1200);
});

const copyDecisionsBtn = document.getElementById('copy-decisions-btn') as HTMLButtonElement | null;
copyDecisionsBtn?.addEventListener('click', async () => {
  await window.electronAPI?.copyToClipboard(decisionFeed.innerText);
  copyDecisionsBtn.textContent = 'COPIED';
  setTimeout(() => (copyDecisionsBtn.textContent = 'COPY'), 1200);
});

// The sidebar overlay is a hidden WebContentsView, so gating this on
// document.visibilityState would stop it from ever re-checking the decision
// backend. Keep the poll unconditional; it is one small IPC round-trip.
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

// Form Submit (Manual Navigation)
urlForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideUrlSuggestions();
  const url = urlInput.value.trim();
  if (!url) return;
  if (window.electronAPI) {
    await window.electronAPI.navigate(url);
  }
});

// URL-bar suggestions: lexical history/bookmarks immediately, semantic recall after a debounce.
const urlSuggestions = document.getElementById('url-suggestions') as HTMLElement | null;
let suggestionItems: Array<{ url: string; title: string; domain?: string; sources?: string[]; snippet?: string }> = [];
let suggestionActive = -1;
let suggestionSeq = 0;
let lexicalTimer: ReturnType<typeof setTimeout> | null = null;
let semanticTimer: ReturnType<typeof setTimeout> | null = null;

function hideUrlSuggestions() {
  suggestionItems = [];
  suggestionActive = -1;
  urlSuggestions?.classList.add('hidden');
  if (urlSuggestions) urlSuggestions.innerHTML = '';
  urlInput.setAttribute('aria-expanded', 'false');
  urlInput.removeAttribute('aria-activedescendant');
}

function renderUrlSuggestions(items: typeof suggestionItems) {
  if (!urlSuggestions) return;
  suggestionItems = items;
  suggestionActive = -1;
  urlSuggestions.innerHTML = '';
  if (!items.length) {
    hideUrlSuggestions();
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.id = `url-suggestion-${index}`;
    row.dataset.url = item.url;
    row.className = 'w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-base-200 focus:bg-base-200 outline-none border-b border-base-100 last:border-0';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    const icon = document.createElement('span');
    icon.className = 'font-mono text-[10px] mt-0.5 text-base-content/50';
    const sources = Array.isArray(item.sources) ? item.sources : [];
    icon.textContent = sources.includes('bookmark') ? '★' : sources.includes('semantic') ? '≈' : '↺';
    const body = document.createElement('span');
    body.className = 'min-w-0 flex-1';
    const title = document.createElement('span');
    title.className = 'block text-xs text-base-content truncate';
    title.textContent = item.title || item.url;
    const url = document.createElement('span');
    url.className = 'block font-mono text-[10px] text-base-content/50 truncate';
    url.textContent = item.url;
    body.append(title, url);
    const badge = document.createElement('span');
    badge.className = 'badge badge-xs font-mono';
    badge.textContent = sources.includes('bookmark') ? 'saved' : sources.includes('semantic') ? 'semantic' : 'history';
    row.append(icon, body, badge);
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => chooseSuggestion(item.url));
    urlSuggestions.appendChild(row);
  });
  urlSuggestions.classList.remove('hidden');
  urlInput.setAttribute('aria-expanded', 'true');
}

async function fetchSuggestions(query: string, semantic: boolean) {
  const seq = ++suggestionSeq;
  const items = await window.electronAPI?.suggestUrls(query, { limit: 8, semantic }).catch(() => []);
  if (seq !== suggestionSeq || document.activeElement !== urlInput) return;
  renderUrlSuggestions(Array.isArray(items) ? items : []);
}

function scheduleSuggestions() {
  if (lexicalTimer) clearTimeout(lexicalTimer);
  if (semanticTimer) clearTimeout(semanticTimer);
  const query = urlInput.value.trim();
  lexicalTimer = setTimeout(() => void fetchSuggestions(query, false), 90);
  if (query.length >= 3) {
    semanticTimer = setTimeout(() => void fetchSuggestions(query, true), 420);
  }
}

function setActiveSuggestion(index: number) {
  if (!urlSuggestions || !suggestionItems.length) return;
  const rows = Array.from(urlSuggestions.querySelectorAll<HTMLElement>('[role="option"]'));
  suggestionActive = (index + suggestionItems.length) % suggestionItems.length;
  rows.forEach((row, i) => {
    const active = i === suggestionActive;
    row.classList.toggle('bg-base-200', active);
    row.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const activeRow = rows[suggestionActive];
  if (activeRow) urlInput.setAttribute('aria-activedescendant', activeRow.id);
}

function chooseSuggestion(url: string) {
  hideUrlSuggestions();
  urlInput.value = url;
  urlForm.requestSubmit();
}

urlInput.addEventListener('input', scheduleSuggestions);
urlInput.addEventListener('focus', scheduleSuggestions);
urlInput.addEventListener('blur', () => {
  setTimeout(() => {
    if (!urlSuggestions?.matches(':hover')) hideUrlSuggestions();
  }, 120);
});
urlInput.addEventListener('keydown', (event) => {
  if (urlSuggestions?.classList.contains('hidden')) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    setActiveSuggestion(suggestionActive + 1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    setActiveSuggestion(suggestionActive - 1);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hideUrlSuggestions();
  } else if (event.key === 'Enter' && suggestionActive >= 0) {
    event.preventDefault();
    const item = suggestionItems[suggestionActive];
    if (item) chooseSuggestion(item.url);
  }
});

// Browser history controls: the toolbar buttons, Alt+Left/Right and F5 all funnel into the same
// IPC the MCP navigate_history tool uses.
const navBackBtn = document.getElementById('nav-back-btn') as HTMLButtonElement | null;
const navForwardBtn = document.getElementById('nav-forward-btn') as HTMLButtonElement | null;
const navReloadBtn = document.getElementById('nav-reload-btn') as HTMLButtonElement | null;

navBackBtn?.addEventListener('click', () => {
  void window.electronAPI?.goBack();
});
navForwardBtn?.addEventListener('click', () => {
  void window.electronAPI?.goForward();
});
navReloadBtn?.addEventListener('click', () => {
  void window.electronAPI?.reload();
});

// Harvest Action
harvestBtn.addEventListener('click', async () => {
  if (window.electronAPI) {
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
  }
});

// Copy Construct Markdown
copyConstructBtn.addEventListener('click', async () => {
  if (!currentConstructMarkdown) return;
  await navigator.clipboard.writeText(currentConstructMarkdown);
  const prevText = copyConstructBtn.innerText;
  copyConstructBtn.innerText = 'COPIED!';
  setTimeout(() => {
    copyConstructBtn.innerText = prevText;
  }, 1500);
});

// Render Construct Payload
function renderConstruct(construct: HarvestedConstruct) {
  currentConstructMarkdown = construct.content;
  constructCodeBlock.textContent = construct.content;
  constructTokenBadge.textContent = `~${construct.estimatedTokens} tokens (${(construct.markdownLength / 1024).toFixed(1)} KB)`;
}

// Render Telemetry Event
function appendTelemetry(event: TelemetryEvent) {
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
function appendLog(log: { id: string; time: string; level: 'info' | 'warn' | 'action'; message: string }) {
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

let currentZoom: ZoomState | null = null;

function renderZoom(zoom: ZoomState | null | undefined): void {
  if (!zoom) return;
  currentZoom = zoom;
  const percent = Math.round(zoom.factor * 100);
  if (zoomLevelBtn) {
    zoomLevelBtn.textContent = `${percent}%`;
    zoomLevelBtn.title = `Reset page zoom to the ${zoom.mode === 'compensate' ? 'fitted' : 'Windows'} default (Ctrl+0)`;
  }
  if (zoomOutBtn) zoomOutBtn.title = `Zoom out (Ctrl+-) - ${percent}%`;
  if (zoomInBtn) zoomInBtn.title = `Zoom in (Ctrl+=) - ${percent}%`;
}

async function applyZoomAction(action: 'in' | 'out' | 'reset'): Promise<void> {
  try {
    renderZoom(await window.electronAPI?.setZoom?.({ action }));
  } catch {
    // A render surface can race a window reload; the next state broadcast wins.
  }
}

/** Page zoom is pinned while a device viewport is emulated. */
function setZoomPinned(pinned: boolean): void {
  for (const control of [zoomOutBtn, zoomInBtn, zoomLevelBtn]) {
    if (!control) continue;
    control.disabled = pinned;
    if (pinned) control.title = 'Page zoom is pinned to 100% while a responsive device is active';
  }
  if (!pinned) renderZoom(currentZoom);
}

zoomOutBtn?.addEventListener('click', () => void applyZoomAction('out'));
zoomInBtn?.addEventListener('click', () => void applyZoomAction('in'));
zoomLevelBtn?.addEventListener('click', () => void applyZoomAction('reset'));

// Update State from Electron
function updateState(state: ChassisState) {
  viewportUrlDisplay.textContent = state.currentUrl;
  activeActionText.textContent = state.activeAction;
  updateActivePage(state.currentUrl, state.pageTitle);

  // Grey out history buttons the active tab cannot honour, instead of letting a click no-op
  // (Electron's navigationHistory silently returns undefined at either end of the stack).
  if (navBackBtn) navBackBtn.disabled = state.canGoBack !== true;
  if (navForwardBtn) navForwardBtn.disabled = state.canGoForward !== true;

  if (state.isLoading) {
    viewportLoadingSpinner.classList.remove('hidden');
  } else {
    viewportLoadingSpinner.classList.add('hidden');
  }

  // Update Agent Status Badge
  agentStatusBadge.textContent = state.agentStatus;
  agentStatusBadge.className = 'badge badge-sm font-mono tracking-tight';
  switch (state.agentStatus) {
    case 'IDLE':
      agentStatusBadge.classList.add('badge-accent');
      break;
    case 'TRAVERSING':
      agentStatusBadge.classList.add('badge-primary');
      break;
    case 'SIMULATING_INPUT':
      agentStatusBadge.classList.add('badge-secondary');
      break;
    case 'HARVESTING':
      agentStatusBadge.classList.add('badge-info');
      break;
    case 'ERROR':
      agentStatusBadge.classList.add('badge-error');
      break;
    case 'AWAITING_INPUT':
      agentStatusBadge.classList.add('badge-warning', 'animate-pulse');
      break;
    case 'HUMAN_INPUT':
      agentStatusBadge.classList.add('badge-info', 'animate-pulse');
      break;
  }

  if (resumeAgentBtn) {
    resumeAgentBtn.classList.toggle('hidden', state.agentStatus !== 'HUMAN_INPUT');
  }
  if (takeOverBtn) {
    takeOverBtn.classList.toggle('hidden', state.agentStatus === 'HUMAN_INPUT' || state.agentStatus === 'AWAITING_INPUT');
  }

  // Update Stats
  statTokens.textContent = `${state.stats.tokensHarvested.toLocaleString()} tkn`;
  statInteractions.textContent = `${state.stats.totalInteractions} interactions`;

  if (state.tabs) {
    renderTabs(state.tabs);
  }
  if (state.zoom) {
    renderZoom(state.zoom);
  }
  if (state.viewport) {
    (window as unknown as { __applyViewportState?: (viewport: ChassisState['viewport']) => void }).__applyViewportState?.(
      state.viewport,
    );
    setZoomPinned(Boolean(state.viewport.active));
  }
}

// Tab Management in Renderer
const tabList = document.getElementById('tab-list') as HTMLElement;
const newTabBtn = document.getElementById('new-tab-btn') as HTMLButtonElement;

function renderTabs(tabs: import('../shared/types.js').TabSummary[]) {
  if (!tabList) return;
  tabList.innerHTML = '';

  tabs.forEach((tab) => {
    const pill = document.createElement('div');
    const isActive = tab.isActive;

    pill.className = `group flex items-center gap-1.5 px-3 py-1 rounded-t-md border-t border-x text-xs font-mono transition-all cursor-pointer select-none max-w-[200px] shrink-0 ${
      isActive
        ? 'bg-base-100 text-accent font-semibold border-base-100 shadow-sm'
        : 'bg-base-300/60 text-base-content/60 hover:bg-base-200 hover:text-base-content border-base-200/40'
    }`;

    // Status dot (pulsing when loading or cyan when active)
    const dot = document.createElement('span');
    dot.className = `w-1.5 h-1.5 rounded-full shrink-0 ${
      tab.isLoading ? 'bg-warning animate-ping' : isActive ? 'bg-accent' : 'bg-base-content/30'
    }`;

    // Title label
    const titleSpan = document.createElement('span');
    titleSpan.className = 'truncate text-[11px] leading-tight flex-1';
    titleSpan.textContent = tab.title || 'New Tab';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'opacity-30 group-hover:opacity-100 hover:text-error text-[10px] ml-1 p-0.5 rounded leading-none';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI?.closeTab(tab.id);
    });

    pill.appendChild(dot);
    pill.appendChild(titleSpan);
    pill.appendChild(closeBtn);

    pill.addEventListener('click', () => {
      if (!tab.isActive) {
        window.electronAPI?.switchTab(tab.id);
      }
    });

    tabList.appendChild(pill);
  });
}

if (newTabBtn) {
  newTabBtn.addEventListener('click', () => {
    window.electronAPI?.createTab('https://news.ycombinator.com');
  });
}

// Initialize IPC listeners
// The main process uses this as a "renderer is painting" signal. If it stops
// while the window is visible, the HUD is reloaded instead of staying white.
// The sidebar is a second renderer, so it must not mask a dead HUD.
if (!SIDEBAR_MODE) {
  window.electronAPI?.hudHeartbeat?.();
  setInterval(() => window.electronAPI?.hudHeartbeat?.(), 3000);
}

if (window.electronAPI) {
  window.electronAPI.getState().then(updateState);
  window.electronAPI.getZoom?.().then(renderZoom).catch(() => undefined);
  window.electronAPI.getTabs().then(renderTabs);
  window.electronAPI.getLatestConstruct().then((construct) => {
    if (construct) renderConstruct(construct);
  });
  window.electronAPI.getLogs().then((logs) => {
    logs.forEach(appendLog);
  });

  window.electronAPI.onStateUpdated(updateState);
  window.electronAPI.onTabsUpdated(renderTabs);
  window.electronAPI.onTelemetry(appendTelemetry);
  window.electronAPI.onConstructHarvested(renderConstruct);
  window.electronAPI.onLog(appendLog);
  window.electronAPI.onHilRequested(showHilBanner);
  window.electronAPI.onHilCleared(removeHilBanner);

  // Check if HIL request is already active on load
  window.electronAPI.getActiveHil().then((active) => {
    if (active) showHilBanner(active);
  });
}

function showHilBanner(req: { id: string; reason: string }) {
  removeHilBanner();
  const banner = document.createElement('div');
  banner.id = 'hud-hil-banner';
  // Anchored to the side panel (right), not across the middle: a human is being asked to act in
  // the *browser*, so the notice must not cover the thing they need to look at.
  banner.className =
    'alert alert-warning shadow-2xl fixed bottom-10 right-3 z-50 w-[min(420px,calc(100vw-1.5rem))] flex items-center justify-between border-2 border-warning font-mono text-xs';

  // Built with textContent, never innerHTML: `reason` can quote page copy (the sensitive-gate rule
  // puts matched lines in it), and page copy is attacker-controlled.
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-2';
  const icon = document.createElement('span');
  icon.className = 'text-base';
  icon.textContent = '⚠️';
  const col = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'font-bold text-[10px] uppercase tracking-wider text-warning-content';
  title.textContent = 'Human Action Needed';
  const reason = document.createElement('div');
  reason.className = 'text-xs text-base-content';
  reason.textContent = req.reason;
  col.append(title, reason);
  wrap.append(icon, col);

  const btn = document.createElement('button');
  btn.id = 'hud-hil-resolve-btn';
  btn.className = 'btn btn-xs btn-success font-mono font-bold ml-4';
  btn.textContent = 'DONE';

  banner.append(wrap, btn);
  document.body.appendChild(banner);

  btn.addEventListener('click', async () => {
    btn.textContent = 'RESUMING...';
    await window.electronAPI.resolveHil(req.id, 'User clicked DONE in Command Deck HUD');
    removeHilBanner();
  });
}

function removeHilBanner() {
  const b = document.getElementById('hud-hil-banner');
  if (b) b.remove();
}

// Keyboard shortcuts (Ctrl+H to harvest). The sidebar overlay renderer is a
// passive surface; it must not trigger browser actions while a human clicks a
// tab there.
window.addEventListener('keydown', (e) => {
  if (SIDEBAR_MODE) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    harvestBtn.click();
  }
  // Browser muscle memory. The browsing view owns focus most of the time, so these only fire when
  // the app shell has focus; the same actions are in the right-click menu on the page itself.
  if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault();
    void window.electronAPI?.goBack();
  }
  if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault();
    void window.electronAPI?.goForward();
  }
  if (e.key === 'F5') {
    e.preventDefault();
    void window.electronAPI?.reload();
  }
});

// ---- Timelapse recorder (Settings → Recording, or the REC button) ---------------------------
const recordBtn = document.getElementById('record-btn') as HTMLButtonElement | null;
const recordLabel = document.getElementById('record-label') as HTMLElement | null;
const recordDot = document.getElementById('record-dot') as HTMLElement | null;
const settingsRecStatus = document.getElementById('settings-rec-status') as HTMLElement | null;
const settingsRecList = document.getElementById('settings-rec-list') as HTMLElement | null;
const settingsRecForm = document.getElementById('settings-rec-form') as HTMLFormElement | null;
const settingsRecEnabled = document.getElementById('settings-rec-enabled') as HTMLInputElement | null;
const settingsRecTools = document.getElementById('settings-rec-tools') as HTMLInputElement | null;
const settingsRecDir = document.getElementById('settings-rec-dir') as HTMLInputElement | null;
const settingsRecInterval = document.getElementById('settings-rec-interval') as HTMLInputElement | null;
const settingsRecFps = document.getElementById('settings-rec-fps') as HTMLInputElement | null;
const settingsRecWidth = document.getElementById('settings-rec-width') as HTMLInputElement | null;
const settingsRecBitrate = document.getElementById('settings-rec-bitrate') as HTMLInputElement | null;
const settingsRecResult = document.getElementById('settings-rec-result') as HTMLElement | null;
const settingsRecRefresh = document.getElementById('settings-rec-refresh') as HTMLButtonElement | null;
const settingsRecBrowse = document.getElementById('settings-rec-browse') as HTMLButtonElement | null;

let lastRecordingStatus: any = { recording: false, enabled: true };
let recordTicker: number | null = null;

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

function showRecResult(kind: 'success' | 'error' | 'info', text: string) {
  showAlert(settingsRecResult, kind, text);
}

function stopRecordTicker() {
  if (recordTicker !== null) {
    window.clearInterval(recordTicker);
    recordTicker = null;
  }
}

function applyRecordingStatus(state: any) {
  if (!state) return;
  lastRecordingStatus = state;
  const recording = Boolean(state.recording);
  const enabled = state.enabled !== false;

  if (recordDot) {
    recordDot.className = recording
      ? 'text-error animate-pulse'
      : enabled
        ? 'text-error/60'
        : 'text-base-content/30';
  }
  if (recordBtn) {
    recordBtn.classList.toggle('btn-error', recording);
    recordBtn.classList.toggle('btn-ghost', !recording);
    recordBtn.classList.toggle('opacity-50', !enabled && !recording);
    // The toolbar button is icon-only now, so the label lives in the tooltip instead of a native
    // title (which would render a second, delayed tooltip on top of the daisyUI one).
    recordBtn.removeAttribute('title');
  }
  const recordTooltip = document.getElementById('record-tooltip');
  if (recordTooltip) {
    recordTooltip.dataset.tip = recording
      ? `Stop and save the timelapse · ${formatElapsed(Date.now() - (state.startedAt || Date.now()))}`
      : enabled
        ? 'Record a timelapse of this window'
        : 'Recording is disabled — open Settings → Recording';
  }
  if (recordLabel) {
    recordLabel.textContent = recording ? `STOP · ${formatElapsed(Date.now() - (state.startedAt || Date.now()))}` : 'REC';
  }
  if (settingsRecStatus) {
    if (recording) {
      settingsRecStatus.className = 'badge badge-error font-mono text-xs whitespace-nowrap';
      settingsRecStatus.textContent = `recording · ${formatElapsed(Date.now() - (state.startedAt || Date.now()))}`;
    } else if (state.error) {
      settingsRecStatus.className = 'badge badge-warning font-mono text-xs whitespace-nowrap';
      settingsRecStatus.textContent = 'error';
      settingsRecStatus.title = state.error;
    } else {
      settingsRecStatus.className = 'badge badge-ghost font-mono text-xs whitespace-nowrap';
      settingsRecStatus.textContent = enabled ? 'idle' : 'disabled';
      settingsRecStatus.title = '';
    }
  }

  if (state.error && !recording) {
    if (recordTooltip) recordTooltip.dataset.tip = `Recording failed: ${state.error}`;
    if (settingsRecResult) showRecResult('error', state.error);
  }

  stopRecordTicker();
  if (recording) {
    recordTicker = window.setInterval(() => {
      if (!lastRecordingStatus?.recording) {
        stopRecordTicker();
        return;
      }
      const elapsed = formatElapsed(Date.now() - (lastRecordingStatus.startedAt || Date.now()));
      if (recordLabel) recordLabel.textContent = `STOP · ${elapsed}`;
      if (settingsRecStatus) settingsRecStatus.textContent = `recording · ${elapsed}`;
    }, 1000);
  }
}

function openSettingsTab(tab: 'decision' | 'recording') {
  settingsBtn?.click();
  document.querySelector<HTMLButtonElement>(`[data-settings-tab="${tab}"]`)?.click();
}

async function refreshRecordingList() {
  if (!settingsRecList) return;
  const items = await window.electronAPI!.listRecordings();
  settingsRecList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('li');
    empty.className = 'font-mono text-[11px] text-base-content/50';
    empty.textContent = 'No timelapses yet.';
    settingsRecList.append(empty);
    return;
  }
  for (const item of items.slice(0, 12)) {
    const row = document.createElement('li');
    row.className = 'flex items-center gap-2 bg-base-200/60 border border-base-100 rounded px-2 py-1.5';

    const name = document.createElement('span');
    name.className = 'font-mono text-[11px] text-base-content/80 whitespace-nowrap';
    name.textContent = item.filename;

    const size = document.createElement('span');
    size.className = 'font-mono text-[10px] text-base-content/40 whitespace-nowrap';
    size.textContent = `${(item.bytes / 1024 / 1024).toFixed(1)} MB`;

    const fullPath = document.createElement('span');
    fullPath.className = 'flex-1 font-mono text-[10px] text-base-content/50 truncate';
    fullPath.textContent = item.path;
    fullPath.title = item.path;

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'btn btn-xs btn-ghost font-mono text-[10px]';
    copy.textContent = 'COPY PATH';
    copy.addEventListener('click', async () => {
      await window.electronAPI?.copyToClipboard(item.path);
      copy.textContent = 'COPIED';
      window.setTimeout(() => (copy.textContent = 'COPY PATH'), 1500);
    });

    row.append(name, size, fullPath, copy);
    settingsRecList.append(row);
  }
}

async function loadRecordingSettings() {
  try {
    const config = await window.electronAPI!.getRecordingConfig();
    if (settingsRecEnabled) settingsRecEnabled.checked = Boolean(config.enabled);
    if (settingsRecTools) settingsRecTools.checked = config.toolsEnabled !== false;
    if (settingsRecDir) settingsRecDir.value = config.outputDir || '';
    if (settingsRecInterval) settingsRecInterval.value = String(config.intervalMs);
    if (settingsRecFps) settingsRecFps.value = String(config.fps);
    if (settingsRecWidth) settingsRecWidth.value = String(config.maxWidth);
    if (settingsRecBitrate) settingsRecBitrate.value = (config.bitrate / 1_000_000).toFixed(1);
    applyRecordingStatus(await window.electronAPI!.getRecordingStatus());
    await refreshRecordingList();
  } catch (err: any) {
    showRecResult('error', `Could not read recording settings: ${err?.message || err}`);
  }
}


recordBtn?.addEventListener('click', async () => {
  if (!recordBtn) return;
  recordBtn.disabled = true;
  try {
    const status = await window.electronAPI!.getRecordingStatus();
    if (status.recording) {
      if (recordLabel) recordLabel.textContent = 'SAVING…';
      const result = await window.electronAPI!.stopRecording();
      if (result?.path) {
        showRecResult('success', `Saved ${result.path}`);
        await refreshRecordingList();
      }
    } else if (status.enabled === false) {
      openSettingsTab('recording');
      showRecResult('info', 'Recording is disabled — enable it here first.');
    } else {
      await window.electronAPI!.startRecording();
    }
  } catch (err: any) {
    const message = String(err?.message || err);
    const tip = document.getElementById('record-tooltip');
    if (tip) tip.dataset.tip = `Recording failed: ${message}`;
    showRecResult('error', message);
  } finally {
    recordBtn.disabled = false;
    try {
      applyRecordingStatus(await window.electronAPI!.getRecordingStatus());
    } catch {
      // The status poll is best-effort.
    }
  }
});

settingsRecBrowse?.addEventListener('click', async () => {
  const dir = await window.electronAPI!.pickRecordingDir();
  if (dir && settingsRecDir) settingsRecDir.value = dir;
});

settingsRecRefresh?.addEventListener('click', () => void refreshRecordingList());

settingsRecForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const saved = await window.electronAPI!.saveRecordingConfig({
      enabled: settingsRecEnabled?.checked !== false,
      toolsEnabled: settingsRecTools?.checked !== false,
      outputDir: settingsRecDir?.value.trim(),
      intervalMs: Number(settingsRecInterval?.value),
      fps: Number(settingsRecFps?.value),
      maxWidth: Number(settingsRecWidth?.value),
      bitrate: Math.round(Number(settingsRecBitrate?.value) * 1_000_000),
    });
    if (settingsRecDir) settingsRecDir.value = saved.outputDir;
    applyRecordingStatus({ ...lastRecordingStatus, enabled: saved.enabled });
    showRecResult('success', `Saved. Timelapses are written to ${saved.outputDir}.`);
    await refreshRecordingList();
  } catch (err: any) {
    showRecResult('error', `Save failed: ${err?.message || err}`);
  }
});

window.electronAPI?.onRecordingBegin((payload) => {
  void beginRecording(payload).catch((err) => window.electronAPI?.recordingFailed?.(String(err?.message || err)));
});
window.electronAPI?.onRecordingStop(() => {
  void finishRecording();
});
window.electronAPI?.onRecordingStatus((state) => applyRecordingStatus(state));
void window.electronAPI?.getRecordingStatus().then(applyRecordingStatus).catch(() => undefined);

// Settings Modal — decision model + recording (full viewport, tabbed)
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement | null;
const settingsModal = document.getElementById('settings-modal') as HTMLDialogElement | null;

if (settingsBtn && settingsModal) {
  const protocolEl = document.getElementById('settings-protocol') as HTMLSelectElement;
  const modelEl = document.getElementById('settings-model') as HTMLInputElement;
  const urlEl = document.getElementById('settings-url') as HTMLInputElement;
  const keyEl = document.getElementById('settings-key') as HTMLInputElement;
  const revisionEl = document.getElementById('settings-revision') as HTMLInputElement;
  const deviceEl = document.getElementById('settings-device') as HTMLSelectElement;
  const badgeEl = document.getElementById('settings-status-badge') as HTMLElement;
  const formEl = document.getElementById('settings-form') as HTMLFormElement;
  const testBtn = document.getElementById('settings-test-btn') as HTMLButtonElement;
  const closeBtn = document.getElementById('settings-close-btn') as HTMLButtonElement;
  const resultEl = document.getElementById('settings-test-result') as HTMLElement;
  const settingsTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
  const settingsPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-panel]'));

  // Research / stealth settings.
  const researchFormEl = document.getElementById('settings-research-form') as HTMLFormElement;
  const researchEnabledEl = document.getElementById('settings-research-enabled') as HTMLInputElement;
  const researchEnginesEl = document.getElementById('settings-research-engines') as HTMLInputElement;
  const researchUrlTemplateEl = document.getElementById('settings-research-url-template') as HTMLInputElement;
  const researchProxyEl = document.getElementById('settings-research-proxy') as HTMLInputElement;
  const researchCooldownEl = document.getElementById('settings-research-cooldown') as HTMLInputElement;
  const researchDelayEl = document.getElementById('settings-research-delay') as HTMLInputElement;
  const researchConcurrencyEl = document.getElementById('settings-research-concurrency') as HTMLInputElement;
  const researchPreferLlmEl = document.getElementById('settings-research-prefer-llm') as HTMLInputElement;
  const researchMaxPagesEl = document.getElementById('settings-research-max-pages') as HTMLInputElement;
  const researchMaxSourcesEl = document.getElementById('settings-research-max-sources') as HTMLInputElement;
  const researchMaxResultsEl = document.getElementById('settings-research-max-results') as HTMLInputElement;
  const researchActivateEl = document.getElementById('settings-research-activate-view') as HTMLInputElement;
const researchPreferStaticEl = document.getElementById('settings-research-prefer-static') as HTMLInputElement;
const researchHumanEl = document.getElementById('settings-research-human') as HTMLInputElement;
const researchHilTimeoutEl = document.getElementById('settings-research-hil-timeout') as HTMLInputElement;
  const researchResultEl = document.getElementById('settings-research-result') as HTMLElement;
  const researchResetEl = document.getElementById('settings-research-reset') as HTMLButtonElement;

  // Shadow Walk settings.
  const shadowFormEl = document.getElementById('settings-shadow-form') as HTMLFormElement;
  const shadowEnabledEl = document.getElementById('shadow-enabled') as HTMLInputElement;
  const shadowAxSealedEl = document.getElementById('shadow-ax-sealed') as HTMLInputElement;
  const shadowDeepOpenEl = document.getElementById('shadow-deep-open') as HTMLInputElement;
  const shadowComponentSurfaceEl = document.getElementById('shadow-component-surface') as HTMLInputElement;
  const shadowPartHighlightEl = document.getElementById('shadow-part-highlight') as HTMLInputElement;
  const shadowCdpStyleEl = document.getElementById('shadow-cdp-style') as HTMLInputElement;
  const shadowTabWalkEl = document.getElementById('shadow-tab-walk') as HTMLInputElement;
  const shadowTabStepsEl = document.getElementById('shadow-tab-steps') as HTMLInputElement;
  const shadowTabRestoreEl = document.getElementById('shadow-tab-restore') as HTMLInputElement;
  const shadowFrameGeometryEl = document.getElementById('shadow-frame-geometry') as HTMLInputElement;
  const shadowFrameControlsEl = document.getElementById('shadow-frame-controls') as HTMLInputElement;
  const shadowFrameScreenshotsEl = document.getElementById('shadow-frame-screenshots') as HTMLInputElement;
  const shadowMaxFramesEl = document.getElementById('shadow-max-frames') as HTMLInputElement;
  const shadowMaxControlsEl = document.getElementById('shadow-max-controls') as HTMLInputElement;
  const shadowShotSideEl = document.getElementById('shadow-shot-side') as HTMLInputElement;
  const shadowForceOpenEl = document.getElementById('shadow-force-open') as HTMLInputElement;
  const shadowDetectEl = document.getElementById('settings-shadow-detect') as HTMLButtonElement;
  const shadowDetectResultEl = document.getElementById('settings-shadow-detect-result') as HTMLElement;
  const shadowPatchChip = document.getElementById('shadow-patch-chip') as HTMLElement | null;
  const shadowResetEl = document.getElementById('settings-shadow-reset') as HTMLButtonElement;
  const shadowResultEl = document.getElementById('settings-shadow-result') as HTMLElement;
  let shadowLoaded: any = null;


const showShadowResult = (kind: 'success' | 'error' | 'info', text: string) => {
    showAlert(shadowResultEl, kind, text);
  };

  const refreshShadowPatchChip = (settings?: any) => {
    if (!shadowPatchChip) return;
    const armed = settings ? settings.enabled !== false && settings.shadow?.forceOpen === true : false;
    shadowPatchChip.classList.toggle('hidden', !armed);
  };

  async function loadShadowWalkSettings(): Promise<void> {
    try {
      const settings = await window.electronAPI?.getShadowWalkSettings();
      if (!settings) return;
      shadowLoaded = settings;
      shadowEnabledEl.checked = settings.enabled !== false;
      shadowAxSealedEl.checked = settings.shadow?.axSealed !== false;
      shadowDeepOpenEl.checked = settings.shadow?.deepOpenRoots !== false;
      shadowComponentSurfaceEl.checked = settings.shadow?.componentSurface !== false;
      shadowPartHighlightEl.checked = settings.shadow?.partHighlight === true;
      shadowCdpStyleEl.checked = settings.shadow?.cdpStyleMatch === true;
      shadowTabWalkEl.checked = settings.shadow?.tabWalk !== false;
      shadowTabStepsEl.value = String(settings.shadow?.tabWalkMaxSteps ?? 8);
      shadowTabRestoreEl.checked = settings.shadow?.tabWalkRestoreFocus !== false;
      shadowFrameGeometryEl.checked = settings.frames?.geometry !== false;
      shadowFrameControlsEl.checked = settings.frames?.controls !== false;
      shadowFrameScreenshotsEl.checked = settings.frames?.screenshots !== false;
      shadowMaxFramesEl.value = String(settings.frames?.maxFrames ?? 6);
      shadowMaxControlsEl.value = String(settings.frames?.maxControls ?? 40);
      shadowShotSideEl.value = String(settings.frames?.screenshotMaxSide ?? 1024);
      shadowForceOpenEl.checked = settings.shadow?.forceOpen === true;
      refreshShadowPatchChip(settings);
    } catch (err: any) {
      showShadowResult('error', `Could not load Shadow Walk settings: ${err?.message || err}`);
    }
  }

  shadowFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = shadowFormEl.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.classList.add('loading');
    }
    try {
      const base = shadowLoaded || {};
      if (shadowForceOpenEl.checked && base.shadow?.forceOpen !== true) {
        const confirmed = window.confirm(
          'Force-open changes attachShadow({mode:"closed"}) to open at document start. The page can detect it. Apply on the next navigation?'
        );
        if (!confirmed) {
          showShadowResult('info', 'Force-open was not enabled.');
          return;
        }
      }
      const result = await window.electronAPI?.saveShadowWalkSettings({
        enabled: shadowEnabledEl.checked,
        shadow: {
          ...(base.shadow || {}),
          deepOpenRoots: shadowDeepOpenEl.checked,
          axSealed: shadowAxSealedEl.checked,
          componentSurface: shadowComponentSurfaceEl.checked,
          partHighlight: shadowPartHighlightEl.checked,
          cdpStyleMatch: shadowCdpStyleEl.checked,
          tabWalk: shadowTabWalkEl.checked,
          tabWalkMaxSteps: Number(shadowTabStepsEl.value) || 8,
          tabWalkRestoreFocus: shadowTabRestoreEl.checked,
          forceOpen: shadowForceOpenEl.checked,
        },
        frames: {
          ...(base.frames || {}),
          geometry: shadowFrameGeometryEl.checked,
          controls: shadowFrameControlsEl.checked,
          screenshots: shadowFrameScreenshotsEl.checked,
          maxFrames: Number(shadowMaxFramesEl.value) || 6,
          maxControls: Number(shadowMaxControlsEl.value) || 40,
          screenshotMaxSide: Number(shadowShotSideEl.value) || 1024,
        },
        cloneLab: base.cloneLab || { enabled: false },
      });
      if (result?.ok) {
        shadowLoaded = result.settings;
        refreshShadowPatchChip(result.settings);
        showShadowResult('success', 'Shadow Walk settings saved. They apply to the next MCP call.');
      } else {
        showShadowResult('error', validationMessage(result));
      }
    } catch (err: any) {
      showShadowResult('error', `Save failed: ${err?.message || err}`);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.classList.remove('loading');
      }
    }
  });

  shadowResetEl.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI?.resetShadowWalkSettings();
      if (result?.ok) {
        await loadShadowWalkSettings();
        refreshShadowPatchChip(result.settings);
        showShadowResult('success', 'Shadow Walk defaults restored.');
      } else {
        showShadowResult('error', validationMessage(result, 'Reset failed.'));
      }
    } catch (err: any) {
      showShadowResult('error', `Reset failed: ${err?.message || err}`);
    }
  });

  shadowDetectEl.addEventListener('click', async () => {
    try {
      const result = await window.electronAPI?.detectShadowPatch();
      const text = result
        ? `${result.applied ? 'APPLIED' : result.armed ? 'ARMED (reload to apply)' : 'NOT APPLIED'} · detectable=${result.detectable} · ${result.note}`
        : 'Detection returned no result.';
      shadowDetectResultEl.className = `alert ${result?.detectable ? 'alert-error' : 'alert-ghost'} alert-sm font-mono text-[10px]`;
      shadowDetectResultEl.textContent = text;
      shadowDetectResultEl.classList.remove('hidden');
    } catch (err: any) {
      shadowDetectResultEl.className = 'alert alert-warning alert-sm font-mono text-[10px]';
      shadowDetectResultEl.textContent = `Detection failed: ${err?.message || err}`;
      shadowDetectResultEl.classList.remove('hidden');
    }
  });

  void window.electronAPI
    ?.getShadowWalkSettings()
    .then((settings) => refreshShadowPatchChip(settings))
    .catch(() => undefined);

  const showResearchResult = (kind: 'success' | 'error' | 'info', text: string) => {
    showAlert(researchResultEl, kind, text);
  };

  async function loadResearchSettings(): Promise<void> {
    try {
      const settings = await window.electronAPI?.getResearchSettings();
      if (!settings) return;
      researchEnabledEl.checked = Boolean(settings.enabled);
      researchEnginesEl.value = Array.isArray(settings.engineChain) ? settings.engineChain.join(', ') : '';
      researchUrlTemplateEl.value = settings.urlTemplate || '';
      researchProxyEl.value = settings.proxyUrl || '';
      researchCooldownEl.value = String(settings.domainCooldownSec ?? 300);
      researchDelayEl.value = String(settings.delayMs ?? 1000);
      researchConcurrencyEl.value = String(settings.crawlConcurrency ?? 1);
      researchPreferLlmEl.checked = settings.preferLlm !== false;
      researchPreferStaticEl.checked = settings.preferStatic !== false;
      researchHumanEl.checked = settings.humanInLoop !== false;
      researchHilTimeoutEl.value = String(settings.hilTimeoutSec ?? 300);
      researchMaxPagesEl.value = String(settings.defaultMaxPages ?? 5);
      researchMaxSourcesEl.value = String(settings.defaultMaxSources ?? 5);
      researchMaxResultsEl.value = String(settings.searchMaxResults ?? 8);
      researchActivateEl.checked = settings.activateView !== false;
    } catch (err: any) {
      showResearchResult('error', `Could not load research settings: ${err?.message || err}`);
    }
  }

  researchFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = researchFormEl.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (submit) {
      submit.disabled = true;
      submit.classList.add('loading');
    }
    try {
      const result = await window.electronAPI?.saveResearchSettings({
        enabled: researchEnabledEl.checked,
        engineChain: researchEnginesEl.value,
        urlTemplate: researchUrlTemplateEl.value.trim(),
        proxyUrl: researchProxyEl.value.trim(),
        domainCooldownSec: Number(researchCooldownEl.value) || 300,
        delayMs: Number(researchDelayEl.value) || 0,
        crawlConcurrency: Number(researchConcurrencyEl.value) || 1,
        preferLlm: researchPreferLlmEl.checked,
        preferStatic: researchPreferStaticEl.checked,
        humanInLoop: researchHumanEl.checked,
        hilTimeoutSec: Number(researchHilTimeoutEl.value) || 300,
        defaultMaxPages: Number(researchMaxPagesEl.value) || 5,
        defaultMaxSources: Number(researchMaxSourcesEl.value) || 5,
        searchMaxResults: Number(researchMaxResultsEl.value) || 8,
        activateView: researchActivateEl.checked,
      });
      if (result?.ok) {
        showResearchResult('success', 'Research stealth settings saved. They apply to the next search/crawl.');
        await loadResearchSettings();
      } else {
        showResearchResult('error', validationMessage(result));
      }
    } catch (err: any) {
      showResearchResult('error', `Save failed: ${err?.message || err}`);
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.classList.remove('loading');
      }
    }
  });

  researchResetEl.addEventListener('click', async () => {
    if (!window.confirm('Clear research cookies, cache, and domain cooldowns?')) return;
    try {
      const result = await window.electronAPI?.resetResearchSession();
      showResearchResult(result?.ok ? 'success' : 'error', result?.ok ? 'Research session cleared.' : result?.error || 'Reset failed.');
    } catch (err: any) {
      showResearchResult('error', `Reset failed: ${err?.message || err}`);
    }
  });


  const showSettingsTab = (tab: string) => {
    for (const button of settingsTabs) {
      button.classList.toggle('tab-active', button.dataset.settingsTab === tab);
    }
    for (const panel of settingsPanels) {
      panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tab);
    }
    badgeEl.classList.toggle('hidden', tab !== 'decision');
    if (tab === 'recording') {
      void loadRecordingSettings();
    }
    if (tab === 'media') {
      void loadMediaSettings();
    }
    if (tab === 'clients') {
      void loadConnectPanel();
    }
    if (tab === 'tools') {
      refreshToolsPanel();
    }
    if (tab === 'remote') {
      void loadRemotePanel();
    }
    if (tab === 'research') {
      void loadResearchSettings();
    }
    if (tab === 'experimental') {
      void window.electronAPI
        ?.getExperimentalSettings?.()
        .then((result) => applyExperimentalSettings(result?.settings))
        .catch(() => undefined);
    }
    if (tab === 'input') {
      void loadInputSettings();
    }
    if (tab === 'shadow') {
      void loadShadowWalkSettings();
    }
    if (tab === 'wrappers') {
      void loadWrapSettings();
      if (activeWrapTab() !== 'credentials') void loadWrapWrappers(undefined, false);
    }
  };
  for (const button of settingsTabs) {
    button.addEventListener('click', () => showSettingsTab(button.dataset.settingsTab || 'decision'));
  }

  // ---- Human input pacing (Settings → INPUT) ------------------------------------------------
  const inputForm = document.getElementById('settings-input-form') as HTMLFormElement | null;
  const inputMouse = document.getElementById('input-mouse-speed') as HTMLInputElement | null;
  const inputTyping = document.getElementById('input-typing-speed') as HTMLInputElement | null;
  const inputDwell = document.getElementById('input-click-dwell') as HTMLInputElement | null;
  const inputMouseValue = document.getElementById('input-mouse-value') as HTMLElement | null;
  const inputTypingValue = document.getElementById('input-typing-value') as HTMLElement | null;
  const inputDwellValue = document.getElementById('input-dwell-value') as HTMLElement | null;
  const inputReset = document.getElementById('settings-input-reset') as HTMLButtonElement | null;
  const inputResult = document.getElementById('settings-input-result') as HTMLElement | null;

  function showInputResult(kind: 'success' | 'error' | 'info', text: string) {
    showAlert(inputResult, kind, text);
  }

  function syncInputLabels() {
    if (inputMouse && inputMouseValue) inputMouseValue.textContent = inputMouse.value;
    if (inputTyping && inputTypingValue) inputTypingValue.textContent = inputTyping.value;
    if (inputDwell && inputDwellValue) inputDwellValue.textContent = inputDwell.value;
  }

  function applyInputProfile(profile: { mouseSpeedPxPerSec: number; typingWpm: number; clickDwellMs: number }) {
    if (inputMouse) inputMouse.value = String(profile.mouseSpeedPxPerSec);
    if (inputTyping) inputTyping.value = String(profile.typingWpm);
    if (inputDwell) inputDwell.value = String(profile.clickDwellMs);
    syncInputLabels();
  }

  async function loadInputSettings() {
    try {
      const profile = await window.electronAPI?.getInputProfile();
      if (profile) applyInputProfile(profile);
    } catch (err: any) {
      showInputResult('error', `Could not read the input profile: ${err?.message || err}`);
    }
  }

  for (const slider of [inputMouse, inputTyping, inputDwell]) {
    slider?.addEventListener('input', syncInputLabels);
  }

  inputForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const result = await window.electronAPI?.saveInputProfile({
        mouseSpeedPxPerSec: Number(inputMouse?.value) || undefined,
        typingWpm: Number(inputTyping?.value) || undefined,
        clickDwellMs: inputDwell ? Number(inputDwell.value) : undefined,
      });
      if (result?.ok) {
        applyInputProfile(result.profile);
        showInputResult('success', 'Applied — the next click and keystroke use the new pacing.');
      } else {
        showInputResult('error', validationMessage(result));
      }
    } catch (err: any) {
      showInputResult('error', `Save failed: ${err?.message || err}`);
    }
  });

  inputReset?.addEventListener('click', () => {
    // Defaults mirror DEFAULT_INPUT_PROFILE in src/main/telemetry/input-profile.ts.
    applyInputProfile({ mouseSpeedPxPerSec: 1400, typingWpm: 220, clickDwellMs: 55 });
    showInputResult('info', 'Defaults restored in the form — press SAVE to apply.');
  });

  const showResult = (kind: 'success' | 'error' | 'info', text: string) => {
    showAlert(resultEl, kind, text);
  };

  const jevToggle = document.getElementById('settings-jev-enabled') as HTMLInputElement | null;
  const jevStatusEl = document.getElementById('settings-jev-status');
  const jevModePrefer = document.getElementById('settings-jev-mode-prefer') as HTMLButtonElement | null;
  const jevModeEnforce = document.getElementById('settings-jev-mode-enforce') as HTMLButtonElement | null;

  const paintJevMode = (mode: 'prefer' | 'enforce', locked: boolean) => {
    const pairs: Array<[HTMLButtonElement | null, boolean]> = [
      [jevModePrefer, mode === 'prefer'],
      [jevModeEnforce, mode === 'enforce'],
    ];
    for (const [button, active] of pairs) {
      if (!button) continue;
      button.classList.toggle('btn-active', active);
      button.classList.toggle('btn-primary', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = locked;
    }
  };

  /** JEV is optional: only offerable once a decision model is configured. */
  const applyJevSettings = (result: any) => {
    const power = result?.settings?.power === true;
    const mode: 'prefer' | 'enforce' = result?.settings?.mode === 'enforce' ? 'enforce' : 'prefer';
    const decisionConfigured = result?.decisionConfigured === true;
    if (jevToggle) {
      jevToggle.checked = power;
      jevToggle.disabled = !decisionConfigured;
    }
    paintJevMode(mode, !decisionConfigured || !power);
    if (jevStatusEl) {
      jevStatusEl.textContent = !decisionConfigured
        ? 'Requires a configured decision model.'
        : !power
          ? 'OFF — agents receive full page markdown.'
          : mode === 'enforce'
            ? 'ENFORCE — unscoped page reads are refused; the agent must use jev_index + read_section.'
            : 'PREFER — tools lead with the index; full-page reads are still allowed.';
    }
  };
  const loadJevSettings = async (): Promise<void> => {
    try {
      applyJevSettings(await window.electronAPI!.getJevSettings());
    } catch {
      // Best effort: the toggle keeps its last state.
    }
  };
  jevToggle?.addEventListener('change', async () => {
    if (!jevToggle) return;
    const result = await window.electronAPI?.saveJevSettings({ power: jevToggle.checked });
    if (result?.ok) applyJevSettings(result);
    else jevToggle.checked = !jevToggle.checked;
  });
  const saveJevMode = async (mode: 'prefer' | 'enforce') => {
    const result = await window.electronAPI?.saveJevSettings({ mode });
    if (result?.ok) applyJevSettings(result);
  };
  jevModePrefer?.addEventListener('click', () => void saveJevMode('prefer'));
  jevModeEnforce?.addEventListener('click', () => void saveJevMode('enforce'));
  window.electronAPI?.onJevSettings(() => void loadJevSettings());

  const showStatus = (status: any, stored: any) => {
    if (status?.configured) {
      badgeEl.className = 'badge badge-success font-mono text-xs whitespace-nowrap';
      badgeEl.textContent = `${status.protocol} · ${status.model}`;
    } else {
      badgeEl.className = 'badge badge-ghost font-mono text-xs whitespace-nowrap';
      badgeEl.textContent = 'off';
    }
    protocolEl.value = stored?.protocol || '';
    modelEl.value = stored?.model || '';
    urlEl.value = stored?.url || '';
    keyEl.value = stored?.key || '';
    revisionEl.value = stored?.revision || '';
    deviceEl.value = stored?.device || '';
  };

  settingsBtn.addEventListener('click', async () => {
    window.electronAPI?.setViewportVisibility(false);
    resultEl.className = 'alert alert-ghost alert-sm font-mono text-xs hidden';
    try {
      const { stored, status } = await window.electronAPI!.getDecisionSettings();
      showStatus(status, stored);
    } catch (err: any) {
      showStatus(null, null);
      showResult('error', `Could not read settings: ${err?.message || err}`);
    }
    void loadJevSettings();
    settingsModal.showModal();
    const activeTab = settingsTabs.find((button) => button.classList.contains('tab-active'))?.dataset.settingsTab;
    if (activeTab === 'recording') void loadRecordingSettings();
    if (activeTab === 'media') void loadMediaSettings();
    if (activeTab === 'clients') void loadConnectPanel();
    if (activeTab === 'tools') refreshToolsPanel();
    if (activeTab === 'remote') void loadRemotePanel();
    if (activeTab === 'research') void loadResearchSettings();
    if (activeTab === 'shadow') void loadShadowWalkSettings();
  });

  settingsModal.addEventListener('close', () => {
    closeWrapWrapperModal();
    window.electronAPI?.setViewportVisibility(true);
  });

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const protocol = protocolEl.value;
    const payload = protocol
      ? {
          protocol,
          model: modelEl.value.trim() || undefined,
          url: urlEl.value.trim() || undefined,
          key: keyEl.value.trim() || undefined,
          revision: revisionEl.value.trim() || undefined,
          device: deviceEl.value.trim() || undefined,
        }
      : null;
    try {
      const saved = await window.electronAPI!.saveDecisionSettings(payload);
      showStatus(saved?.status, payload);
      setDecisionTabVisible(Boolean(saved?.status?.configured), saved?.status);
      showResult(
        'success',
        saved?.ok
          ? saved.status?.configured
            ? `Saved. decide is now available via ${saved.status.protocol} (${saved.status.model}).`
            : 'Saved. No backend is configured, so decide stays hidden.'
          : 'Saved to disk, but the configuration could not be applied.'
      );
    } catch (err: any) {
      showResult('error', `Save failed: ${err?.message || err}`);
    }
  });

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.classList.add('loading');
    showResult('info', 'Testing…');
    try {
      const result = await window.electronAPI!.testDecisionModel();
      if (result?.ok) {
        const answer = result.answers?.reachable;
        showResult(
          'success',
          `${result.protocol} · ${result.model} · ${result.latencyMs}ms — answered ${JSON.stringify(answer ?? result.answers)}`
        );
      } else {
        showResult('error', `${result?.error?.code || 'ERROR'} — ${result?.error?.message || 'no answer'}${result?.error?.hint ? ` (${result.error.hint})` : ''}`);
      }
    } catch (err: any) {
      showResult('error', `Test failed: ${err?.message || err}`);
    } finally {
      testBtn.disabled = false;
      testBtn.classList.remove('loading');
    }
  });

  closeBtn.addEventListener('click', () => settingsModal.close());
}


// ---- Auto-update banner (packaged builds only; the main process disables it elsewhere) ------
const updateBanner = document.getElementById('update-banner') as HTMLElement | null;
const updateText = document.getElementById('update-text') as HTMLElement | null;
const updateAction = document.getElementById('update-action') as HTMLButtonElement | null;
const updateBadge = document.getElementById('update-badge') as HTMLButtonElement | null;
let lastUpdateState: any = null;

function renderUpdateBadge(state: any): void {
  if (!updateBadge) return;
  const status = state?.status;
  const version = state?.version ? ` v${state.version}` : '';
  updateBadge.classList.remove('hidden', 'badge-info', 'badge-warning', 'badge-success', 'badge-error');
  if (status === 'checking') {
    updateBadge.textContent = 'CHECKING UPDATE';
    updateBadge.classList.add('badge-info');
    updateBadge.disabled = true;
    updateBadge.title = 'Checking GitHub Releases for a newer version.';
  } else if (status === 'available') {
    updateBadge.textContent = `UPDATE${version}`;
    updateBadge.classList.add('badge-info');
    updateBadge.disabled = true;
    updateBadge.title = 'Update found; downloading now.';
  } else if (status === 'downloading') {
    updateBadge.textContent = `DOWNLOADING${state.percent ? ` ${state.percent}%` : ''}`;
    updateBadge.classList.add('badge-warning');
    updateBadge.disabled = true;
    updateBadge.title = 'Downloading the update in the background.';
  } else if (status === 'ready') {
    updateBadge.textContent = `RESTART${version}`;
    updateBadge.classList.add('badge-success');
    updateBadge.disabled = false;
    updateBadge.title = 'Update downloaded. Click to restart and install.';
  } else if (status === 'error') {
    updateBadge.textContent = 'UPDATE FAILED';
    updateBadge.classList.add('badge-error');
    updateBadge.disabled = true;
    updateBadge.title = state?.message || 'Update check failed.';
  } else {
    updateBadge.classList.add('hidden');
    updateBadge.disabled = true;
    updateBadge.textContent = '';
  }
}

function renderUpdateState(state: any) {
  lastUpdateState = state;
  renderUpdateBadge(state);
  if (!updateBanner || !updateText || !updateAction) return;
  const show = (text: string, withAction = false) => {
    updateText.textContent = text;
    updateBanner.classList.remove('hidden');
    updateBanner.classList.add('flex');
    updateAction.classList.toggle('hidden', !withAction);
  };
  const hide = () => {
    updateBanner.classList.add('hidden');
    updateBanner.classList.remove('flex');
  };

  switch (state?.status) {
    case 'checking':
      hide();
      break;
    case 'available':
      show(`Update ${state.version ? `v${state.version}` : ''} found — downloading…`);
      break;
    case 'downloading':
      show(`Downloading update${state.percent ? ` ${state.percent}%` : ''}…`);
      break;
    case 'ready':
      show(`Update ${state.version ? `v${state.version}` : ''} ready`, true);
      break;
    default:
      // idle / disabled / error stay quiet — there is nothing for the human to do.
      hide();
  }
}

async function restartForUpdate(): Promise<void> {
  if (lastUpdateState?.status !== 'ready') return;
  if (updateAction) {
    updateAction.disabled = true;
    updateAction.textContent = 'RESTARTING…';
  }
  if (updateBadge) {
    updateBadge.disabled = true;
    updateBadge.textContent = 'RESTARTING…';
  }
  await window.electronAPI?.installUpdate();
}

updateAction?.addEventListener('click', () => void restartForUpdate());
updateBadge?.addEventListener('click', () => void restartForUpdate());

window.electronAPI?.onUpdateStatus(renderUpdateState);
window.electronAPI?.getUpdateStatus().then(renderUpdateState).catch(() => {});

// About Modal & Viewport Visibility Management
const aboutBtn = document.getElementById('about-btn') as HTMLButtonElement | null;
const aboutModal = document.getElementById('about_modal') as HTMLDialogElement | null;

if (aboutBtn && aboutModal) {
  aboutBtn.addEventListener('click', () => {
    window.electronAPI?.setViewportVisibility(false);
    aboutModal.showModal();
  });

  aboutModal.addEventListener('close', () => {
    window.electronAPI?.setViewportVisibility(true);
  });
}
