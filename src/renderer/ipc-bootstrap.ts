/**
 * The renderer's IPC wiring: state, tabs, telemetry, logs, constructs, zoom, sidebar, update and
 * settings-tab updates pushed from the main process, plus the initial state fetches.
 *
 * Imported for its side effects by the entry point.
 */
import { applySidebarState, SIDEBAR_MODE } from './sidebar-mode';
import { appendLog, appendTelemetry, renderConstruct } from './telemetry-feed';
import { renderTabs } from './tab-bar';
import { renderZoom } from './zoom-controls';
import { renderUpdateState } from './update-banner';
import { syncDecisions } from './decision-feed';
import { updateState } from './update-state';
import { harvestBtn } from './harvest-button';
import { wrapSubPanels, wrapSubTabs, wrapWrapperModalEl } from './settings-wrap-dom';
import { loadWrapSettings } from './settings-wrap-secrets';
import { loadWrapWrappers } from './settings-wrap-list';
import { loadDecisionSettings, setDecisionBadgeVisible } from './settings-decision';
import { resetSettingsResult } from './settings-feedback';
import { loadRecordingSettings } from './settings-recording';
import { loadMediaSettings } from './settings-media';
import { loadConnectPanel } from './connect-panel';
import { loadRemotePanel } from './remote-panel';
import { loadResearchSettings } from './settings-research';
import { loadShadowWalkSettings } from './settings-shadow';
import { loadInputSettings } from './settings-input';
import { loadJevSettings } from './settings-jev';
import { refreshToolsPanel } from './tools-panel';
import { bootMenuPopup } from './menu-popup';

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

/** When to use: the experimental flags changed. */
export function applyExperimentalSettings(settings: { collab?: boolean } | null | undefined): void {
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

/** When to use: refresh the collaboration badge count. */
export async function refreshCollaborationCount(): Promise<void> {
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
