/**
 * The Command Deck renderer's boot module.
 *
 * Why this file is small: each surface is its own module — `deck/nav-bar.ts` (URL bar,
 * suggestions, history, zoom, version), `deck/hud.ts` (feeds, construct, harvest),
 * `deck/panel-tabs.ts` (the lower tabs), `deck/tabs-strip.ts` (the browser tabs),
 * `deck/sidebar.ts` (modes, orb, collab), `deck/hil.ts` (hand-off toast and banner),
 * `deck/decisions.ts` (the decision mirror), `deck/webstate.ts` (breadcrumbs/storage),
 * `deck/trail.ts` (the ghost-cursor canvas), `deck/recording-panel.ts` (timelapse) and
 * `deck/settings-modal.ts` (the dialog). This module wires them in boot order and owns the
 * viewport header and the `ChassisState` → DOM projection.
 */
import type { ElectronAPI } from '../preload/index.js';
import type { ChassisState } from '../shared/types.js';
import { initCortexPanel, updateActivePage } from './cortex-panel.js';
import { initDecisions } from './deck/decisions.js';
import { appendLog, appendTelemetry, clickHarvest, initHud, renderConstruct, renderStats } from './deck/hud.js';
import { initHil } from './deck/hil.js';
import { MENU_POPUP_MODE, SIDEBAR_MODE } from './deck/mode.js';
import { initNavBar, renderZoom, setHistoryEnabled, setZoomPinned } from './deck/nav-bar.js';
import { initSettingsModal } from './deck/settings-modal.js';
import { initSidebar } from './deck/sidebar.js';
import { initTabs, renderTabs } from './deck/tabs-strip.js';
import { initTrail } from './deck/trail.js';
import { initWebState } from './deck/webstate.js';
import { initRecordingPanel } from './deck/recording-panel.js';
import { bootMenuPopup } from './menu-popup.js';
import { initMediaPanel } from './settings-media.js';
import { initInputSettings } from './settings-input.js';
import { initJevSettings } from './settings-jev.js';
import { initConnectPanel } from './settings-clients.js';
import { initRemotePanel } from './settings-remote.js';
import { initResearchSettings } from './settings-research.js';
import { initShadowWalkSettings } from './settings-shadow-walk.js';
import { initWrapSecrets } from './settings-wrap-secrets.js';
import { initResearchPanel } from './research-panel.js';
import { initUpdateBanner } from './update-banner.js';
import { initViewportControls } from './viewport-controls.js';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

if (MENU_POPUP_MODE) bootMenuPopup();

// ---- Viewport header ------------------------------------------------------
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

// ---- State projection -----------------------------------------------------
function updateState(state: ChassisState): void {
  viewportUrlDisplay.textContent = state.currentUrl;
  activeActionText.textContent = state.activeAction;
  updateActivePage(state.currentUrl, state.pageTitle);

  // Grey out history buttons the active tab cannot honour, instead of letting a click no-op
  // (Electron's navigationHistory silently returns undefined at either end of the stack).
  setHistoryEnabled(state.canGoBack === true, state.canGoForward === true);

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

  renderStats(state.stats);
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

// ---- Boot -----------------------------------------------------------------
initTrail();
initSidebar();
initNavBar();
initHud();
initTabs();
initWebState();
initDecisions();
initHil();

initResearchPanel();
initViewportControls();
initCortexPanel({ appendLog });
initRemotePanel();
initConnectPanel();
initMediaPanel();
initWrapSecrets();
initResearchSettings();
initShadowWalkSettings();
initInputSettings();
initJevSettings();
initUpdateBanner();

const { openSettingsTab } = initSettingsModal();
initRecordingPanel({ openSettingsTab });

// Keyboard shortcuts (Ctrl+H to harvest). The sidebar overlay renderer is a
// passive surface; it must not trigger browser actions while a human clicks a
// tab there.
window.addEventListener('keydown', (e) => {
  if (SIDEBAR_MODE) return;
  if (e.ctrlKey && e.key.toLowerCase() === 'h') {
    e.preventDefault();
    clickHarvest();
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
