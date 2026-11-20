import type { ElectronAPI } from '../preload/index.js';
import type { ChassisState, ConnectInfo, HarvestedConstruct, TelemetryEvent } from '../shared/types.js';
import type { ZoomState } from '../shared/zoom.js';
import { BRAND } from '../shared/brand.js';
import { beginRecording, finishRecording } from './recording';
import { refreshToolsPanel } from './tools-panel';
import { initResearchPanel } from './research-panel';
import { initViewportControls } from './viewport-controls';
import { bootMenuPopup } from './menu-popup';
import './about-modal';
import { setCortexLogger, syncCortexPage } from './cortex-panel';
import { loadConnectPanel } from './connect-panel';
import { loadRemotePanel } from './remote-panel';
import { loadMediaSettings } from './settings-media';
import { loadRecordingSettings } from './settings-recording';
import { loadResearchSettings } from './settings-research';
import { loadShadowWalkSettings } from './settings-shadow';
import { loadInputSettings } from './settings-input';
import { loadJevSettings } from './settings-jev';
import { resetSettingsResult, showSettingsResult } from './settings-feedback';

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

const hilPanel = document.getElementById('hil-panel');
const hilPanelReason = document.getElementById('hil-panel-reason');
const hilPanelResume = document.getElementById('hil-panel-resume');
const hilPanelCancel = document.getElementById('hil-panel-cancel');
const hilPanelReload = document.getElementById('hil-panel-reload');

/** The mode the deck had before a hand-off forced it docked; restored on clear. */
let hilRestoreMode: SidebarMode | null = null;

/**
 * Swap the Command Deck into its hand-off variant.
 *
 * The deck is the one HIL surface: a slim docked panel replaces its body while the
 * agent waits, and the previous content comes back untouched on clear. Nothing is
 * injected into the page and nothing floats over it, so the page a human needs to
 * look at stays fully readable. Only the sidebar document owns this state.
 */
function setDeckHilMode(active: boolean, reason?: string): void {
  if (!SIDEBAR_MODE || !sidebarPanel || !hilPanel) return;
  for (const child of Array.from(sidebarPanel.children)) {
    const el = child as HTMLElement;
    if (el.id === 'hil-panel') continue;
    el.style.display = active ? 'none' : '';
  }
  hilPanel.classList.toggle('hidden', !active);
  hilPanel.classList.toggle('flex', active);
  if (active && reason && hilPanelReason) {
    hilPanelReason.textContent = reason;
  }
  if (active) {
    // A hand-off must be visible: bring the deck into its docked slot, remembering
    // where it was so the user's layout comes back afterwards.
    if (currentSidebarMode !== 'docked') {
      hilRestoreMode = currentSidebarMode;
      applySidebarMode('docked');
      window.electronAPI?.setSidebarMode('docked');
    }
  } else if (hilRestoreMode) {
    applySidebarMode(hilRestoreMode);
    window.electronAPI?.setSidebarMode(hilRestoreMode);
    hilRestoreMode = null;
  }
}

window.electronAPI?.onHilRequested((request) => {
  sidebarRailToggle?.classList.add('is-hil');
  setDeckHilMode(true, request?.reason || 'Human intervention required');
});
window.electronAPI?.onHilCleared(() => {
  sidebarRailToggle?.classList.remove('is-hil');
  setDeckHilMode(false);
});
hilPanelResume?.addEventListener('click', () => {
  void window.electronAPI?.resolveHil();
});
hilPanelCancel?.addEventListener('click', () => {
  void window.electronAPI?.cancelHil();
});
hilPanelReload?.addEventListener('click', () => {
  void window.electronAPI?.reloadHil();
});
// A hand-off raised before this document finished loading must still show.
if (SIDEBAR_MODE) {
  window.electronAPI?.getActiveHil().then((active) => {
    if (active?.id) {
      sidebarRailToggle?.classList.add('is-hil');
      setDeckHilMode(true, active.reason || 'Human intervention required');
    }
  }).catch(() => undefined);
}
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
  syncCortexPage(state.currentUrl, state.pageTitle);

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
  const settingsTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
  const settingsPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-panel]'));

  // Research / stealth settings.





  // Hypagon REST secrets: write-only from this panel.
  const wrapWarningEl = document.getElementById('settings-wrap-warning') as HTMLElement;
  const wrapFormEl = document.getElementById('settings-wrap-secret-form') as HTMLFormElement;
  const wrapNameEl = document.getElementById('settings-wrap-name') as HTMLInputElement;
  const wrapHeaderEl = document.getElementById('settings-wrap-header') as HTMLInputElement;
  const wrapValueEl = document.getElementById('settings-wrap-value') as HTMLInputElement;
  const wrapHostsEl = document.getElementById('settings-wrap-hosts') as HTMLInputElement;
  const wrapPrefixEl = document.getElementById('settings-wrap-prefix') as HTMLInputElement;
  const wrapKindEl = document.getElementById('settings-wrap-kind') as HTMLSelectElement;
  const wrapOAuthEl = document.getElementById('settings-wrap-oauth') as HTMLElement;
  const wrapTokenUrlEl = document.getElementById('settings-wrap-token-url') as HTMLInputElement;
  const wrapClientIdEl = document.getElementById('settings-wrap-client-id') as HTMLInputElement;
  const wrapScopeEl = document.getElementById('settings-wrap-scope') as HTMLInputElement;
  const wrapResultEl = document.getElementById('settings-wrap-result') as HTMLElement;
  const wrapRefreshEl = document.getElementById('settings-wrap-refresh') as HTMLButtonElement;
  const wrapSaveEl = document.querySelector<HTMLButtonElement>('#settings-wrap-secret-form button[type="submit"]');
  const wrapListEl = document.getElementById('settings-wrap-secret-list') as HTMLElement;
  const wrapCancelEditEl = document.getElementById('settings-wrap-cancel-edit') as HTMLButtonElement;

  const wrapSubTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-wrap-tab]'));
  const wrapSubPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-wrap-panel]'));

  const wrapWrapperModalEl = document.getElementById('wrap-wrapper-modal') as HTMLDialogElement;
  const wrapWrapperCloseEl = document.getElementById('settings-wrap-wrapper-close') as HTMLButtonElement;
  const wrapWrapperCancelEl = document.getElementById('settings-wrap-wrapper-cancel') as HTMLButtonElement;
  const wrapWrapperListEl = document.getElementById('settings-wrap-wrapper-list') as HTMLElement;
  const wrapWrapperFilterEl = document.getElementById('settings-wrap-wrapper-filter') as HTMLInputElement;
  const wrapWrapperHeadingEl = document.getElementById('settings-wrap-wrapper-heading') as HTMLElement;
  const wrapWrapperTitleEl = document.getElementById('settings-wrap-wrapper-title') as HTMLElement;
  const wrapWrapperBadgeEl = document.getElementById('settings-wrap-wrapper-badge') as HTMLElement;
  const wrapWrapperFormEl = document.getElementById('settings-wrap-wrapper-form') as HTMLFormElement;
  const wrapWrapperResultEl = document.getElementById('settings-wrap-wrapper-result') as HTMLElement;
  const wrapWrapperSaveEl = document.getElementById('settings-wrap-wrapper-save') as HTMLButtonElement;
  const wrapWrapperDeleteEl = document.getElementById('settings-wrap-wrapper-delete') as HTMLButtonElement;
  const wrapWrapperNewEl = document.getElementById('settings-wrap-wrapper-new') as HTMLButtonElement;
  const wrapWrapperRefreshEl = document.getElementById('settings-wrap-wrapper-refresh') as HTMLButtonElement;

  const wrapFieldNameEl = document.getElementById('settings-wrap-field-name') as HTMLInputElement;
  const wrapFieldIdEl = document.getElementById('settings-wrap-field-id') as HTMLInputElement;
  const wrapFieldDescriptionEl = document.getElementById('settings-wrap-field-description') as HTMLInputElement;
  const wrapFieldMethodEl = document.getElementById('settings-wrap-field-method') as HTMLSelectElement;
  const wrapFieldUrlEl = document.getElementById('settings-wrap-field-url') as HTMLInputElement;
  const wrapFieldAuthEl = document.getElementById('settings-wrap-field-auth') as HTMLSelectElement;
  const wrapFieldMutatingEl = document.getElementById('settings-wrap-field-mutating') as HTMLInputElement;

  function selectedWrapMethods(): string[] {
    return Array.from(wrapFieldMethodEl.selectedOptions).map((option) => option.value);
  }

  function setWrapMethods(methods: string[]): void {
    const wanted = new Set(methods.length ? methods : ['GET']);
    for (const option of Array.from(wrapFieldMethodEl.options)) {
      option.selected = wanted.has(option.value);
    }
  }

  function wrapperMethods(wrapper: any): string[] {
    const methods = Array.isArray(wrapper?.request?.methods) ? wrapper.request.methods : [];
    if (methods.length) return methods.map((method: string) => String(method).toUpperCase());
    return [String(wrapper?.request?.method || 'GET').toUpperCase()];
  }
  const wrapCredentialPanelEl = document.getElementById('settings-wrap-credential-panel') as HTMLElement;
  const wrapCredentialNameEl = document.getElementById('settings-wrap-credential-name') as HTMLInputElement;
  const wrapCredentialValueEl = document.getElementById('settings-wrap-credential-value') as HTMLInputElement;
  const wrapCredentialHostsEl = document.getElementById('settings-wrap-credential-hosts') as HTMLInputElement;
  const wrapCredentialHeaderEl = document.getElementById('settings-wrap-credential-header') as HTMLInputElement;
  const wrapCredentialPrefixEl = document.getElementById('settings-wrap-credential-prefix') as HTMLInputElement;
  const wrapFieldInputSchemaEl = document.getElementById('settings-wrap-field-input-schema') as HTMLTextAreaElement;
  const wrapFieldQueryEl = document.getElementById('settings-wrap-field-query') as HTMLTextAreaElement;
  const wrapFieldHeadersEl = document.getElementById('settings-wrap-field-headers') as HTMLTextAreaElement;
  const wrapFieldBodyEl = document.getElementById('settings-wrap-field-body') as HTMLTextAreaElement;
  const wrapFieldBodyFormatEl = document.getElementById('settings-wrap-field-body-format') as HTMLSelectElement;
  const wrapFieldResponseEl = document.getElementById('settings-wrap-field-response') as HTMLTextAreaElement;
  const wrapFieldNotesEl = document.getElementById('settings-wrap-field-notes') as HTMLInputElement;

  let wrapSecretsAvailable = true;
  let wrapWrappers: any[] = [];
  let wrapSecretNames: string[] = [];
  let selectedWrapperId: string | null = null;
  let editingSecretName: string | null = null;
  let wrapperIdTouched = false;

  const DEFAULT_INPUT_SCHEMA = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  };

  const showWrapResult = (kind: 'success' | 'error' | 'info', text: string) => {
    wrapResultEl.className = `alert alert-${kind} alert-sm font-mono text-xs`;
    wrapResultEl.textContent = text;
    wrapResultEl.classList.remove('hidden');
  };

  /** Show the OAuth2 fields only when that credential type is selected. */
  const syncWrapKind = () => {
    const oauth = wrapKindEl.value === 'oauth2';
    wrapOAuthEl.classList.toggle('hidden', !oauth);
    wrapValueEl.placeholder = oauth
      ? 'client secret; it is never shown again'
      : 'paste the credential; it is never shown again';
  };

  const showWrapperResult = (kind: 'success' | 'error' | 'info', text: string) => {
    wrapWrapperResultEl.className = `alert alert-${kind} alert-sm font-mono text-xs mt-2`;
    wrapWrapperResultEl.textContent = text;
    wrapWrapperResultEl.classList.remove('hidden');
  };

  function renderWrapWrappers(): void {
    wrapWrapperListEl.replaceChildren();
    const query = wrapWrapperFilterEl.value.trim().toLowerCase();
    const visible = query
      ? wrapWrappers.filter((wrapper) =>
          `${wrapper.id} ${wrapper.name} ${safeHostLabel(wrapper.request?.url)}`.toLowerCase().includes(query),
        )
      : wrapWrappers;

    if (!visible.length) {
      const empty = document.createElement('li');
      empty.className = 'font-mono text-[11px] text-base-content/50 px-1 py-2';
      empty.textContent = wrapWrappers.length
        ? 'No wrappers match that filter.'
        : 'No wrappers saved. Press NEW or ask an agent to create one.';
      wrapWrapperListEl.append(empty);
      return;
    }

    for (const wrapper of visible) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'w-full text-left rounded-box border px-3 py-2 transition-colors ' +
        (wrapper.id === selectedWrapperId
          ? 'border-primary bg-primary/10'
          : 'border-base-100 bg-base-200/60 hover:bg-base-200');
      const id = document.createElement('div');
      id.className = 'font-mono text-xs text-base-content truncate';
      id.textContent = wrapper.id;
      const meta = document.createElement('div');
      meta.className = 'font-mono text-[10px] text-base-content/50 truncate';
      meta.textContent = `${wrapper.name} · ${wrapperMethods(wrapper).join('/')} ${safeHostLabel(wrapper.request?.url)}`;
      button.append(id, meta);
      button.addEventListener('click', () => selectWrapWrapper(wrapper.id));
      wrapWrapperListEl.append(button);
    }
  }

  function safeHostLabel(url: unknown): string {
    try {
      return new URL(String(url || '')).host;
    } catch {
      return String(url || '');
    }
  }

  function openWrapWrapperModal(): void {
    if (!wrapWrapperModalEl.open) wrapWrapperModalEl.showModal();
  }

  function slugifyWrapperId(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^[^a-z]+/, '')
      .replace(/[._-]{2,}/g, '-')
      .replace(/[._-]+$/g, '')
      .slice(0, 80);
  }

  function hostFromUrl(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  function prettyJson(value: unknown): string {
    return value === undefined ? '' : JSON.stringify(value, null, 2);
  }

  function populateAuthOptions(selected?: string): void {
    const current = selected !== undefined ? selected : wrapFieldAuthEl.value;
    const names = [...wrapSecretNames];
    if (current && current !== '__new__' && !names.includes(current)) names.unshift(current);

    wrapFieldAuthEl.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'No credential';
    wrapFieldAuthEl.append(none);

    for (const name of names) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = wrapSecretNames.includes(name) ? name : `${name} (missing)`;
      wrapFieldAuthEl.append(option);
    }

    const add = document.createElement('option');
    add.value = '__new__';
    add.textContent = '+ New credential…';
    wrapFieldAuthEl.append(add);

    wrapFieldAuthEl.value =
      current === '__new__' || current === '' || names.includes(current) ? current : '';
    updateCredentialPanel();
  }

  function updateCredentialPanel(): void {
    const isNew = wrapFieldAuthEl.value === '__new__';
    wrapCredentialPanelEl.classList.toggle('hidden', !isNew);
    if (isNew && !wrapCredentialHostsEl.value) {
      const host = hostFromUrl(wrapFieldUrlEl.value);
      if (host) wrapCredentialHostsEl.value = host;
    }
  }

  function resetCredentialPanel(): void {
    wrapCredentialNameEl.value = '';
    wrapCredentialValueEl.value = '';
    wrapCredentialHostsEl.value = '';
    wrapCredentialHeaderEl.value = 'Authorization';
    wrapCredentialPrefixEl.value = 'Bearer ';
  }

  function setWrapperForm(wrapper: any | null): void {
    wrapWrapperResultEl.classList.add('hidden');
    resetCredentialPanel();

    if (wrapper) {
      selectedWrapperId = wrapper.id;
      wrapWrapperHeadingEl.textContent = 'EDIT WRAPPER';
      wrapWrapperTitleEl.textContent = wrapper.id;
      const bits = [wrapperMethods(wrapper).join('/')];
      if (wrapper.mutating) bits.push('mutating');
      if (wrapper.request?.auth) bits.push(`secret: ${wrapper.request.auth}`);
      wrapWrapperBadgeEl.textContent = bits.join(' · ');
      wrapWrapperBadgeEl.className = 'badge badge-ghost badge-xs font-mono';

      wrapFieldNameEl.value = wrapper.name || '';
      wrapFieldIdEl.value = wrapper.id || '';
      wrapFieldIdEl.disabled = true;
      wrapperIdTouched = true;
      wrapFieldDescriptionEl.value = wrapper.description || '';
      setWrapMethods(wrapperMethods(wrapper));
      wrapFieldUrlEl.value = wrapper.request?.url || '';
      wrapFieldMutatingEl.checked = Boolean(wrapper.mutating);
      wrapFieldInputSchemaEl.value = prettyJson(wrapper.inputSchema || DEFAULT_INPUT_SCHEMA);
      wrapFieldQueryEl.value = prettyJson(wrapper.request?.query);
      wrapFieldHeadersEl.value = prettyJson(wrapper.request?.headers);
      wrapFieldBodyEl.value = prettyJson(wrapper.request?.body);
      wrapFieldBodyFormatEl.value = wrapper.request?.bodyFormat || '';
      wrapFieldResponseEl.value = prettyJson(wrapper.response);
      wrapFieldNotesEl.value = wrapper.notes || '';
      wrapWrapperDeleteEl.disabled = false;
      populateAuthOptions(wrapper.request?.auth || '');
    } else {
      selectedWrapperId = null;
      wrapWrapperHeadingEl.textContent = 'NEW WRAPPER';
      wrapWrapperTitleEl.textContent = 'Not saved';
      wrapWrapperBadgeEl.className = 'badge badge-ghost badge-xs font-mono hidden';
      wrapFieldNameEl.value = '';
      wrapFieldIdEl.value = '';
      wrapFieldIdEl.disabled = false;
      wrapperIdTouched = false;
      wrapFieldDescriptionEl.value = '';
      setWrapMethods(['GET']);
      wrapFieldUrlEl.value = '';
      wrapFieldMutatingEl.checked = false;
      wrapFieldInputSchemaEl.value = prettyJson(DEFAULT_INPUT_SCHEMA);
      wrapFieldQueryEl.value = '';
      wrapFieldHeadersEl.value = '';
      wrapFieldBodyEl.value = '';
      wrapFieldBodyFormatEl.value = '';
      wrapFieldResponseEl.value = '';
      wrapFieldNotesEl.value = '';
      wrapWrapperDeleteEl.disabled = true;
      populateAuthOptions('');
    }

    wrapWrapperSaveEl.disabled = false;
    renderWrapWrappers();
  }

  function selectWrapWrapper(id: string, open = true): void {
    const wrapper = wrapWrappers.find((entry) => entry.id === id);
    if (!wrapper) return;
    setWrapperForm(wrapper);
    if (open) openWrapWrapperModal();
  }

  function newWrapWrapper(): void {
    setWrapperForm(null);
    openWrapWrapperModal();
    wrapFieldNameEl.focus();
  }

  async function loadWrapWrappers(selectId?: string, open = true): Promise<void> {
    try {
      const wrappers = await window.electronAPI?.listWrapWrappers();
      if (!Array.isArray(wrappers)) return;
      wrapWrappers = wrappers;
      const wanted = selectId ?? selectedWrapperId;
      const next = wanted ? wrappers.find((wrapper) => wrapper.id === wanted) : undefined;
      if (next) {
        selectWrapWrapper(next.id, open);
      } else {
        selectedWrapperId = null;
        wrapWrapperHeadingEl.textContent = 'NEW WRAPPER';
        wrapWrapperTitleEl.textContent = 'Not saved';
        wrapWrapperBadgeEl.className = 'badge badge-ghost badge-xs font-mono hidden';
        wrapWrapperDeleteEl.disabled = true;
        wrapWrapperSaveEl.disabled = true;
        if (wrapWrapperModalEl.open) wrapWrapperModalEl.close();
        renderWrapWrappers();
      }
    } catch (err: any) {
      showWrapperResult('error', `Could not load wrappers: ${err?.message || err}`);
    }
  }

  const renderWrapSecrets = (secrets: any[]) => {
    wrapListEl.replaceChildren();
    if (!secrets.length) {
      const empty = document.createElement('li');
      empty.className = 'font-mono text-[11px] text-base-content/50';
      empty.textContent = 'No secrets yet. Add one above; agents will see its name and allowed hosts.';
      wrapListEl.append(empty);
      return;
    }

    for (const secret of secrets) {
      const row = document.createElement('li');
      row.className =
        'flex items-center justify-between gap-3 rounded-box border border-base-100 bg-base-200/60 px-3 py-2';

      const text = document.createElement('div');
      text.className = 'min-w-0';
      const name = document.createElement('div');
      name.className = 'font-mono text-xs text-base-content';
      name.textContent = secret.name;
      const meta = document.createElement('div');
      meta.className = 'font-mono text-[10px] text-base-content/50 truncate';
      meta.textContent = `${secret.header}: ${secret.allowedHosts.join(', ')}`;
      text.append(name, meta);

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-1 shrink-0';

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn-xs btn-ghost font-mono text-[10px]';
      edit.textContent = 'EDIT';
      edit.addEventListener('click', () => beginEditSecret(secret));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-xs btn-ghost font-mono text-[10px]';
      remove.textContent = 'DELETE';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete secret "${secret.name}"? Wrappers using it will stop working.`)) return;
        const result = await window.electronAPI?.deleteWrapSecret(secret.name);
        showWrapResult(result?.ok ? 'success' : 'error', result?.ok ? `Deleted ${secret.name}.` : (result?.errors || []).join('; ') || 'Delete failed.');
        if (editingSecretName === secret.name) resetSecretForm();
        await loadWrapSettings();
      });

      actions.append(edit, remove);
      row.append(text, actions);
      wrapListEl.append(row);
    }
  };

  function beginEditSecret(secret: any): void {
    editingSecretName = secret.name;
    wrapNameEl.value = secret.name;
    wrapHeaderEl.value = secret.header;
    wrapHostsEl.value = (secret.allowedHosts || []).join(', ');
    wrapPrefixEl.value = secret.prefix;
    wrapValueEl.value = '';
    wrapKindEl.value = secret.kind === 'oauth2' ? 'oauth2' : 'static';
    wrapTokenUrlEl.value = secret.oauth2?.tokenUrl || '';
    wrapClientIdEl.value = secret.oauth2?.clientId || '';
    wrapScopeEl.value = secret.oauth2?.scope || '';
    syncWrapKind();
    wrapCancelEditEl.classList.remove('hidden');
    if (wrapSaveEl) wrapSaveEl.textContent = 'UPDATE SECRET';
    showWrapResult('info', `Editing ${secret.name}. Leave the value blank to keep the current credential.`);
    wrapNameEl.focus();
  }

  function resetSecretForm(): void {
    editingSecretName = null;
    wrapNameEl.value = '';
    wrapValueEl.value = '';
    wrapHostsEl.value = '';
    wrapHeaderEl.value = 'Authorization';
    wrapPrefixEl.value = 'Bearer ';
    wrapKindEl.value = 'static';
    wrapTokenUrlEl.value = '';
    wrapClientIdEl.value = '';
    wrapScopeEl.value = '';
    syncWrapKind();
    wrapCancelEditEl.classList.add('hidden');
    if (wrapSaveEl) wrapSaveEl.textContent = 'SAVE SECRET';
  }

  function showWrapSubTab(tab: string): void {
    for (const button of wrapSubTabs) {
      button.classList.toggle('tab-active', button.dataset.wrapTab === tab);
    }
    for (const panel of wrapSubPanels) {
      panel.classList.toggle('hidden', panel.dataset.wrapPanel !== tab);
    }
    if (tab === 'credentials') void loadWrapSettings();
    if (tab === 'wrappers') void loadWrapWrappers(undefined, false);
  }

  for (const button of wrapSubTabs) {
    button.addEventListener('click', () => showWrapSubTab(button.dataset.wrapTab || 'wrappers'));
  }

  async function loadWrapSettings(): Promise<void> {
    try {
      const data = await window.electronAPI?.listWrapSecrets();
      if (!data) return;
      wrapSecretsAvailable = Boolean(data.available);
      if (data.warning) {
        wrapWarningEl.textContent = data.warning;
        wrapWarningEl.classList.remove('hidden');
      } else {
        wrapWarningEl.classList.add('hidden');
      }
      if (wrapSaveEl) wrapSaveEl.disabled = !data.available;
      wrapSecretNames = (data.secrets || []).map((secret: any) => secret.name).filter(Boolean);
      renderWrapSecrets(data.secrets || []);
      if (wrapWrapperModalEl.open) populateAuthOptions(wrapFieldAuthEl.value);
    } catch (err: any) {
      showWrapResult('error', `Could not load secrets: ${err?.message || err}`);
    }
  }

  wrapHeaderEl.addEventListener('change', () => {
    if (wrapHeaderEl.value.trim().toLowerCase() !== 'authorization' && wrapPrefixEl.value === 'Bearer ') {
      wrapPrefixEl.value = '';
    }
  });

  wrapRefreshEl.addEventListener('click', () => {
    void loadWrapSettings();
  });

  wrapFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = wrapNameEl.value.trim();
    const value = wrapValueEl.value;
    const allowedHosts = wrapHostsEl.value.trim();
    const editing = Boolean(editingSecretName) && editingSecretName === name;

    if (!name || !allowedHosts) {
      showWrapResult('error', 'Name and at least one allowed host are required.');
      return;
    }
    if (!value && !editing) {
      showWrapResult('error', 'Value is required for a new secret or a renamed secret.');
      return;
    }

    const kind = wrapKindEl.value === 'oauth2' ? 'oauth2' : 'static';
    const tokenUrl = wrapTokenUrlEl.value.trim();
    const clientId = wrapClientIdEl.value.trim();
    const scope = wrapScopeEl.value.trim();
    if (kind === 'oauth2' && (!tokenUrl || !clientId)) {
      showWrapResult('error', 'An OAuth2 credential needs a token URL and a client ID.');
      return;
    }

    if (wrapSaveEl) {
      wrapSaveEl.disabled = true;
      wrapSaveEl.classList.add('loading');
    }
    try {
      const header = wrapHeaderEl.value.trim() || 'Authorization';
      const prefix =
        header.toLowerCase() !== 'authorization' && wrapPrefixEl.value === 'Bearer ' ? '' : wrapPrefixEl.value;
      const result = await window.electronAPI?.setWrapSecret({
        name,
        value,
        allowedHosts,
        header,
        prefix,
        kind,
        ...(kind === 'oauth2' ? { tokenUrl, clientId, scope } : {}),
      });
      if (result?.ok) {
        resetSecretForm();
        showWrapResult('success', `Saved ${name}. Agents can reference it by name; the value stays here.`);
        await loadWrapSettings();
      } else {
        showWrapResult('error', (result?.errors || []).join('; ') || 'Save failed.');
      }
    } catch (err: any) {
      showWrapResult('error', `Save failed: ${err?.message || err}`);
    } finally {
      if (wrapSaveEl) {
        wrapSaveEl.disabled = !wrapSecretsAvailable;
        wrapSaveEl.classList.remove('loading');
      }
    }
  });

  wrapCancelEditEl.addEventListener('click', resetSecretForm);
  wrapKindEl.addEventListener('change', syncWrapKind);

  wrapWrapperFilterEl.addEventListener('input', renderWrapWrappers);

  wrapWrapperCloseEl.addEventListener('click', () => wrapWrapperModalEl.close());
  wrapWrapperCancelEl.addEventListener('click', () => wrapWrapperModalEl.close());
  wrapWrapperModalEl.addEventListener('close', () => {
    wrapWrapperResultEl.classList.add('hidden');
    wrapCredentialValueEl.value = '';
  });

  wrapWrapperRefreshEl.addEventListener('click', () => {
    void loadWrapWrappers(undefined, false);
  });

  wrapWrapperNewEl.addEventListener('click', newWrapWrapper);

  wrapFieldNameEl.addEventListener('input', () => {
    if (!wrapperIdTouched) wrapFieldIdEl.value = slugifyWrapperId(wrapFieldNameEl.value);
  });

  wrapFieldIdEl.addEventListener('input', () => {
    wrapperIdTouched = wrapFieldIdEl.value.trim().length > 0;
  });

  wrapFieldMethodEl.addEventListener('change', () => {
    const methods = selectedWrapMethods();
    wrapFieldMutatingEl.checked = methods.some((method) => !['GET', 'HEAD'].includes(method));
  });

  wrapFieldAuthEl.addEventListener('change', updateCredentialPanel);

  const prefillCredentialHost = () => {
    if (wrapFieldAuthEl.value === '__new__' && !wrapCredentialHostsEl.value.trim()) {
      const host = hostFromUrl(wrapFieldUrlEl.value);
      if (host) wrapCredentialHostsEl.value = host;
    }
  };
  wrapFieldUrlEl.addEventListener('input', prefillCredentialHost);
  wrapFieldUrlEl.addEventListener('blur', prefillCredentialHost);

  wrapCredentialHeaderEl.addEventListener('change', () => {
    if (
      wrapCredentialHeaderEl.value.trim().toLowerCase() !== 'authorization' &&
      wrapCredentialPrefixEl.value === 'Bearer '
    ) {
      wrapCredentialPrefixEl.value = '';
    }
  });

  function readJsonField(
    element: HTMLTextAreaElement,
    label: string,
    fallback?: unknown,
  ): { ok: true; value: unknown } | { ok: false; error: string } {
    const text = element.value.trim();
    if (!text) return { ok: true, value: fallback };
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (err: any) {
      return { ok: false, error: `${label}: ${err?.message || err}` };
    }
  }

  /** When to use: the save handler's first step — read the form and report every field error at once. */
  function readWrapperForm() {
    const name = wrapFieldNameEl.value.trim();
    const id = wrapFieldIdEl.value.trim();
    const url = wrapFieldUrlEl.value.trim();
    const methods = selectedWrapMethods();
    const description = wrapFieldDescriptionEl.value.trim();

    const errors: string[] = [];
    if (!name) errors.push('Name is required.');
    if (!id) errors.push('ID is required.');
    if (!url) errors.push('URL is required.');
    if (methods.length === 0) errors.push('Select at least one HTTP method.');

    const inputSchemaResult = readJsonField(wrapFieldInputSchemaEl, 'Input schema', DEFAULT_INPUT_SCHEMA);
    const queryResult = readJsonField(wrapFieldQueryEl, 'Query template');
    const headersResult = readJsonField(wrapFieldHeadersEl, 'Headers');
    const bodyResult = readJsonField(wrapFieldBodyEl, 'Body template');
    const responseResult = readJsonField(wrapFieldResponseEl, 'Response recipe');

    for (const result of [inputSchemaResult, queryResult, headersResult, bodyResult, responseResult]) {
      if (!result.ok) errors.push(result.error);
    }

    const original = selectedWrapperId ? wrapWrappers.find((wrapper) => wrapper.id === selectedWrapperId) : undefined;
    const preferred = original?.request?.method;
    const primaryMethod =
      typeof preferred === 'string' && methods.includes(preferred.toUpperCase())
        ? preferred.toUpperCase()
        : methods[0];
    const orderedMethods = [primaryMethod, ...methods.filter((method) => method !== primaryMethod)];

    return {
      name,
      id,
      url,
      methods,
      description,
      errors,
      original,
      primaryMethod,
      orderedMethods,
      inputSchemaValue: inputSchemaResult.ok ? inputSchemaResult.value : DEFAULT_INPUT_SCHEMA,
      queryValue: queryResult.ok ? queryResult.value : undefined,
      headersValue: headersResult.ok ? headersResult.value : undefined,
      bodyValue: bodyResult.ok ? bodyResult.value : undefined,
      responseValue: responseResult.ok ? responseResult.value : undefined,
    };
  }

  /**
   * When to use: the save handler's credential step — a saved name passes through, and the
   * inline "new credential" form is written and selected. Returns null when the panel refused.
   */
  async function resolveWrapperAuth(auth: string, url: string): Promise<string | null> {
    if (auth !== '__new__') return auth;

    const credentialName = wrapCredentialNameEl.value.trim();
    const credentialValue = wrapCredentialValueEl.value;
    const allowedHosts = wrapCredentialHostsEl.value.trim() || hostFromUrl(url);
    if (!credentialName || !credentialValue || !allowedHosts) {
      showWrapperResult('error', 'New credential needs a name, value, and allowed host.');
      return null;
    }

    const header = wrapCredentialHeaderEl.value.trim() || 'Authorization';
    const prefix =
      header.toLowerCase() !== 'authorization' && wrapCredentialPrefixEl.value === 'Bearer '
        ? ''
        : wrapCredentialPrefixEl.value;
    const credential = await window.electronAPI?.setWrapSecret({
      name: credentialName,
      value: credentialValue,
      allowedHosts,
      header,
      prefix,
    });
    if (!credential?.ok) {
      showWrapperResult('error', `Credential rejected: ${(credential?.errors || []).join('; ') || 'unknown error'}`);
      return null;
    }

    await loadWrapSettings();
    wrapFieldAuthEl.value = credentialName;
    updateCredentialPanel();
    return credentialName;
  }

  /** When to use: the save handler's last step — the wrapper object sent to the main process. */
  function buildWrapperPayload(form: ReturnType<typeof readWrapperForm>, auth: string): Record<string, unknown> {
    const request: Record<string, unknown> = { method: form.primaryMethod, url: form.url };
    if (form.orderedMethods.length > 1) request.methods = form.orderedMethods;
    if (auth && auth !== '__new__') request.auth = auth;
    if (form.queryValue !== undefined) request.query = form.queryValue;
    if (form.headersValue !== undefined) request.headers = form.headersValue;
    if (form.bodyValue !== undefined) request.body = form.bodyValue;
    if (wrapFieldBodyFormatEl.value) request.bodyFormat = wrapFieldBodyFormatEl.value;
    if (form.original?.request?.timeoutMs) request.timeoutMs = form.original.request.timeoutMs;

    const wrapper: Record<string, unknown> = {
      schemaVersion: 1,
      id: form.id,
      name: form.name,
      request,
      inputSchema: form.inputSchemaValue,
      mutating: wrapFieldMutatingEl.checked,
    };
    if (form.description) wrapper.description = form.description;
    if (form.responseValue !== undefined) wrapper.response = form.responseValue;
    if (wrapFieldNotesEl.value.trim()) wrapper.notes = wrapFieldNotesEl.value.trim();
    if (form.original?.exposeAsTool !== undefined) wrapper.exposeAsTool = form.original.exposeAsTool;
    if (form.original?.lastVerified !== undefined) wrapper.lastVerified = form.original.lastVerified;
    return wrapper;
  }

  wrapWrapperFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = readWrapperForm();
    if (form.errors.length) {
      showWrapperResult('error', form.errors.join(' '));
      return;
    }

    wrapWrapperSaveEl.disabled = true;
    wrapWrapperSaveEl.classList.add('loading');
    try {
      const auth = await resolveWrapperAuth(wrapFieldAuthEl.value, form.url);
      if (auth === null) return;

      const result = await window.electronAPI?.saveWrapWrapper(buildWrapperPayload(form, auth));
      if (result?.ok) {
        const savedId = result.wrapper?.id || form.id;
        await loadWrapWrappers(savedId, false);
        wrapWrapperModalEl.close();
      } else {
        showWrapperResult('error', (result?.errors || []).join('; ') || 'Save failed.');
      }
    } catch (err: any) {
      showWrapperResult('error', `Save failed: ${err?.message || err}`);
    } finally {
      wrapWrapperSaveEl.disabled = false;
      wrapWrapperSaveEl.classList.remove('loading');
    }
  });

  wrapWrapperDeleteEl.addEventListener('click', async () => {
    if (!selectedWrapperId) return;
    if (!window.confirm(`Delete wrapper "${selectedWrapperId}"? Credentials are kept.`)) return;
    const result = await window.electronAPI?.deleteWrapWrapper(selectedWrapperId);
    if (result?.ok) {
      await loadWrapWrappers(undefined, false);
      wrapWrapperModalEl.close();
    } else {
      showWrapperResult('error', (result?.errors || []).join('; ') || 'Delete failed.');
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
      const activeWrapTab = wrapSubTabs.find((button) => button.classList.contains('tab-active'))?.dataset.wrapTab;
      if (activeWrapTab !== 'credentials') void loadWrapWrappers(undefined, false);
    }
  };
  for (const button of settingsTabs) {
    button.addEventListener('click', () => showSettingsTab(button.dataset.settingsTab || 'decision'));
  }



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
    resetSettingsResult();
    try {
      const { stored, status } = await window.electronAPI!.getDecisionSettings();
      showStatus(status, stored);
    } catch (err: any) {
      showStatus(null, null);
      showSettingsResult('error', `Could not read settings: ${err?.message || err}`);
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
    if (wrapWrapperModalEl.open) wrapWrapperModalEl.close();
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
      showSettingsResult(
        'success',
        saved?.ok
          ? saved.status?.configured
            ? `Saved. decide is now available via ${saved.status.protocol} (${saved.status.model}).`
            : 'Saved. No backend is configured, so decide stays hidden.'
          : 'Saved to disk, but the configuration could not be applied.'
      );
    } catch (err: any) {
      showSettingsResult('error', `Save failed: ${err?.message || err}`);
    }
  });

  testBtn.addEventListener('click', async () => {
    testBtn.disabled = true;
    testBtn.classList.add('loading');
    showSettingsResult('info', 'Testing…');
    try {
      const result = await window.electronAPI!.testDecisionModel();
      if (result?.ok) {
        const answer = result.answers?.reachable;
        showSettingsResult(
          'success',
          `${result.protocol} · ${result.model} · ${result.latencyMs}ms — answered ${JSON.stringify(answer ?? result.answers)}`
        );
      } else {
        showSettingsResult('error', `${result?.error?.code || 'ERROR'} — ${result?.error?.message || 'no answer'}${result?.error?.hint ? ` (${result.error.hint})` : ''}`);
      }
    } catch (err: any) {
      showSettingsResult('error', `Test failed: ${err?.message || err}`);
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
setCortexLogger(appendLog);
