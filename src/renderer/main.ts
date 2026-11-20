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
import { loadDecisionSettings, setDecisionBadgeVisible, setDecisionTabSink } from './settings-decision';
import { wrapSecretNames, wrapState } from './settings-wrap-store';
import { wrapUi } from './settings-wrap-ui';
import { loadWrapWrappers, newWrapWrapper, populateAuthOptions, renderWrapWrappers, selectWrapWrapper, showWrapperResult } from './settings-wrap-list';
import { openWrapWrapperModal, setWrapperForm } from './settings-wrap-modal';

Object.assign(wrapUi, {
  refreshList: renderWrapWrappers,
  refreshAuthOptions: populateAuthOptions,
  showResult: showWrapperResult,
  openModal: openWrapWrapperModal,
  fillForm: setWrapperForm,
});
import {
  beginEditSecret,
  loadWrapSettings,
  renderWrapSecrets,
  resetSecretForm,
  setAuthOptionsSink,
  setWrapperListSink,
  showWrapResult,
  syncWrapKind,
} from './settings-wrap-secrets';
import {
  wrapWarningEl,
  wrapFormEl,
  wrapNameEl,
  wrapHeaderEl,
  wrapValueEl,
  wrapHostsEl,
  wrapPrefixEl,
  wrapKindEl,
  wrapOAuthEl,
  wrapTokenUrlEl,
  wrapClientIdEl,
  wrapScopeEl,
  wrapResultEl,
  wrapRefreshEl,
  wrapSaveEl,
  wrapListEl,
  wrapCancelEditEl,
  wrapSubTabs,
  wrapSubPanels,
  wrapWrapperModalEl,
  wrapWrapperCloseEl,
  wrapWrapperCancelEl,
  wrapWrapperListEl,
  wrapWrapperFilterEl,
  wrapWrapperHeadingEl,
  wrapWrapperTitleEl,
  wrapWrapperBadgeEl,
  wrapWrapperFormEl,
  wrapWrapperResultEl,
  wrapWrapperSaveEl,
  wrapWrapperDeleteEl,
  wrapWrapperNewEl,
  wrapWrapperRefreshEl,
  wrapFieldNameEl,
  wrapFieldIdEl,
  wrapFieldDescriptionEl,
  wrapFieldMethodEl,
  wrapFieldUrlEl,
  wrapFieldAuthEl,
  wrapFieldMutatingEl,
  wrapCredentialPanelEl,
  wrapCredentialNameEl,
  wrapCredentialValueEl,
  wrapCredentialHostsEl,
  wrapCredentialHeaderEl,
  wrapCredentialPrefixEl,
  wrapFieldInputSchemaEl,
  wrapFieldQueryEl,
  wrapFieldHeadersEl,
  wrapFieldBodyEl,
  wrapFieldBodyFormatEl,
  wrapFieldResponseEl,
  wrapFieldNotesEl,
} from './settings-wrap-dom';
import { hideUrlSuggestions } from './url-suggestions';
import { navBackBtn, navForwardBtn, navReloadBtn } from './url-bar';
import { renderZoom, setZoomPinned } from './zoom-controls';
import { renderTabs } from './tab-bar';
import { updateState } from './update-state';
import {
  urlForm,
  urlInput,
  viewportUrlDisplay,
  viewportLoadingSpinner,
  agentStatusBadge,
  activeActionText,
  copyConstructBtn,
  chassisVersionBadge,
  aboutVersion,
  statVelocity,
  statTokens,
  statInteractions,
  tabBtnTelemetry,
  tabBtnConstruct,
  tabBtnLogs,
  tabContentTelemetry,
  tabContentConstruct,
  tabContentLogs,
} from './hud-dom';
import { renderTrail, resizeCanvas } from './canvas-trail';
import { renderUpdateState } from './update-banner';
import { refreshWebState } from './web-state';
import {
  decisionFeed,
  refreshDecisionTab,
  setDecisionSwitchSink,
  setDecisionTabVisible,
  syncDecisions,
  tabBtnDecisions,
  tabContentDecisions,
} from './decision-feed';
import { harvestBtn, setHarvestTabSink } from './harvest-button';
import { sidebarPanel, sidebarRailToggle, sidebarState } from './sidebar-state';
import { applySidebarMode, applySidebarState, SIDEBAR_MODE, toggleSidebar } from './sidebar-mode';
import { setDeckHilMode } from './hil-panel';
import type { SidebarMode } from './sidebar-state';
import { cursorTrail } from './cursor-trail';
import {
  appendLog,
  appendTelemetry,
  currentConstructMarkdown,
  logsContainer,
  renderConstruct,
} from './telemetry-feed';

setDecisionTabSink(setDecisionTabVisible);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

const MENU_POPUP_MODE = new URLSearchParams(window.location.search).has('menupopup');
if (MENU_POPUP_MODE) bootMenuPopup();

// UI Elements
const resumeAgentBtn = document.getElementById('resume-agent-btn') as HTMLButtonElement | null;
const takeOverBtn = document.getElementById('take-over-btn') as HTMLButtonElement | null;

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

// Tabs


// Dynamic Lists & Preview

// Radar Canvas for Cursor Tracking
window.addEventListener('resize', resizeCanvas);

// ---- Native floating Cyberdeck panel ------------------------------------------------------
// The panel is rendered in its own WebContentsView (`?sidebar=1`) so it can sit
// above the native browser view. The main window keeps this DOM copy hidden.

// ---- Collab-mode toolbar: [(‹) prev] [(›) next] [list] [pen] [ESC] ------------
document.getElementById('collab-btn')?.addEventListener('click', () => window.electronAPI?.setCollabMode(true));
document.getElementById('collab-prev-btn')?.addEventListener('click', () => window.electronAPI?.collabNavigate(-1));
document.getElementById('collab-next-btn')?.addEventListener('click', () => window.electronAPI?.collabNavigate(1));
document.getElementById('collab-list-btn')?.addEventListener('click', () => window.electronAPI?.collabToggleList());
document.getElementById('collab-pick-btn')?.addEventListener('click', () => void window.electronAPI?.startCollaborationPicker());
document.getElementById('collab-exit-btn')?.addEventListener('click', () => window.electronAPI?.setCollabMode(false));
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (document.activeElement instanceof HTMLInputElement) return;
  if (document.activeElement instanceof HTMLTextAreaElement) return;
  // Deck focus owns Escape while the note picker/toolbar is in play.
  if (sidebarState.collabModeOn) window.electronAPI?.setCollabMode(false);
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

// Render loop for organic Ghost Cursor trail
resizeCanvas();

requestAnimationFrame(renderTrail);

// Tab switching
setHarvestTabSink(() => switchTab('construct'));

setDecisionSwitchSink((tab) => switchTab(tab));

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
tabBtnDecisions.addEventListener('click', () => switchTab('decisions'));

// ---- Decision model mirror (tab appears only when a backend is configured) -------------------

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


// Harvest Action

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
// Update State from Electron

// Tab Management in Renderer

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
  const closeBtn = document.getElementById('settings-close-btn') as HTMLButtonElement;
  const settingsTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
  const settingsPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-panel]'));

  // Research / stealth settings.





  // Hypagon REST secrets: write-only from this panel.










  /** Show the OAuth2 fields only when that credential type is selected. */



















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












  /** When to use: the save handler's first step — read the form and report every field error at once. */

  /**
   * When to use: the save handler's credential step — a saved name passes through, and the
   * inline "new credential" form is written and selected. Returns null when the panel refused.
   */

  /** When to use: the save handler's last step — the wrapper object sent to the main process. */



  const showSettingsTab = (tab: string) => {
    for (const button of settingsTabs) {
      button.classList.toggle('tab-active', button.dataset.settingsTab === tab);
    }
    for (const panel of settingsPanels) {
      panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tab);
    }
    setDecisionBadgeVisible(tab === 'decision');
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




  settingsBtn.addEventListener('click', async () => {
    window.electronAPI?.setViewportVisibility(false);
    resetSettingsResult();
    void loadDecisionSettings();
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

  closeBtn.addEventListener('click', () => settingsModal.close());
}


// ---- Auto-update banner (packaged builds only; the main process disables it elsewhere) ------
window.electronAPI?.getUpdateStatus().then(renderUpdateState).catch(() => {});

// About Modal & Viewport Visibility Management
setCortexLogger(appendLog);
