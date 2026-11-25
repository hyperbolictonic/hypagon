/**
 * The Settings dialog (decision model + every panel tab) and the About dialog.
 *
 * Why a module: the dialog owns the tab switch — which is what decides *which* panel loads — so
 * every panel's loader meets here. Keeping it out of the boot module means the boot file only
 * wires things, and the recording panel reaches the dialog through the one callback this returns.
 *
 * Why it reads as steps: the tab switch, the decision form, the connection test and the
 * open/close handlers each own a slice of the dialog, so a change to one cannot touch the others.
 */
import { showAlert } from '../settings-alert.js';
import { loadConnectPanel } from '../settings-clients.js';
import { loadInputSettings } from '../settings-input.js';
import { loadJevSettings } from '../settings-jev.js';
import { loadMediaSettings } from '../settings-media.js';
import { loadRemotePanel } from '../settings-remote.js';
import { loadResearchSettings } from '../settings-research.js';
import { loadShadowWalkSettings } from '../settings-shadow-walk.js';
import { activeWrapTab, loadWrapSettings } from '../settings-wrap-secrets.js';
import { closeWrapWrapperModal, loadWrapWrappers } from '../settings-wrap-wrappers.js';
import { refreshToolsPanel } from '../tools-panel.js';
import { setDecisionTabVisible } from './decisions.js';
import { loadRecordingSettings } from './recording-panel.js';
import { applyExperimentalSettings } from './sidebar.js';

const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement | null;
const settingsModal = document.getElementById('settings-modal') as HTMLDialogElement | null;

/** The decision tab's fields. */
interface DecisionFormElements {
  protocolEl: HTMLSelectElement;
  modelEl: HTMLInputElement;
  urlEl: HTMLInputElement;
  keyEl: HTMLInputElement;
  revisionEl: HTMLInputElement;
  deviceEl: HTMLSelectElement;
  badgeEl: HTMLElement;
  formEl: HTMLFormElement;
  testBtn: HTMLButtonElement;
  resultEl: HTMLElement;
}

/** When to use: the About button — a small dialog, not a tab. */
function wireAboutModal(): void {
  const aboutBtn = document.getElementById('about-btn') as HTMLButtonElement | null;
  const aboutModal = document.getElementById('about_modal') as HTMLDialogElement | null;
  if (!aboutBtn || !aboutModal) return;

  aboutBtn.addEventListener('click', () => {
    window.electronAPI?.setViewportVisibility(false);
    aboutModal.showModal();
  });

  aboutModal.addEventListener('close', () => {
    window.electronAPI?.setViewportVisibility(true);
  });
}

/** Paint the decision badge and the stored fields. */
function showDecisionStatus(elements: DecisionFormElements, status: any, stored: any): void {
  if (status?.configured) {
    elements.badgeEl.className = 'badge badge-success font-mono text-xs whitespace-nowrap';
    elements.badgeEl.textContent = `${status.protocol} · ${status.model}`;
  } else {
    elements.badgeEl.className = 'badge badge-ghost font-mono text-xs whitespace-nowrap';
    elements.badgeEl.textContent = 'off';
  }
  elements.protocolEl.value = stored?.protocol || '';
  elements.modelEl.value = stored?.model || '';
  elements.urlEl.value = stored?.url || '';
  elements.keyEl.value = stored?.key || '';
  elements.revisionEl.value = stored?.revision || '';
  elements.deviceEl.value = stored?.device || '';
}

/** The decision form's save and test actions. */
function wireDecisionForm(elements: DecisionFormElements): void {
  const showResult = (kind: 'success' | 'error' | 'info', text: string): void => {
    showAlert(elements.resultEl, kind, text);
  };

  elements.formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    const protocol = elements.protocolEl.value;
    const payload = protocol
      ? {
          protocol,
          model: elements.modelEl.value.trim() || undefined,
          url: elements.urlEl.value.trim() || undefined,
          key: elements.keyEl.value.trim() || undefined,
          revision: elements.revisionEl.value.trim() || undefined,
          device: elements.deviceEl.value.trim() || undefined,
        }
      : null;
    try {
      const saved = await window.electronAPI!.saveDecisionSettings(payload);
      showDecisionStatus(elements, saved?.status, payload);
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

  elements.testBtn.addEventListener('click', async () => {
    elements.testBtn.disabled = true;
    elements.testBtn.classList.add('loading');
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
      elements.testBtn.disabled = false;
      elements.testBtn.classList.remove('loading');
    }
  });
}

/** Load whatever the panel needs when its tab is shown. */
function reloadPanel(tab: string): void {
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
    if (activeWrapTab() !== 'credentials') void loadWrappers(false);
  }
}

/** A wrapper loader that never asks the bridge for the credential list. */
function loadWrappers(force: boolean): void {
  loadWrapWrappers(undefined, force);
}

/** The tab strip: highlight one tab, show its panel and load what it needs. */
function showSettingsTab(
  tab: string,
  view: { settingsTabs: HTMLButtonElement[]; settingsPanels: HTMLElement[]; badgeEl: HTMLElement },
): void {
  for (const button of view.settingsTabs) {
    button.classList.toggle('tab-active', button.dataset.settingsTab === tab);
  }
  for (const panel of view.settingsPanels) {
    panel.classList.toggle('hidden', panel.dataset.settingsPanel !== tab);
  }
  view.badgeEl.classList.toggle('hidden', tab !== 'decision');
  reloadPanel(tab);
}

/**
 * When to use: the HUD boot — wire the dialog.
 * Returns `openSettingsTab` so the REC button can jump straight to Recording.
 */
export function initSettingsModal(): { openSettingsTab: (tab: 'decision' | 'recording') => void } {
  wireAboutModal();

  const openSettingsTab = (tab: 'decision' | 'recording'): void => {
    settingsBtn?.click();
    document.querySelector<HTMLButtonElement>(`[data-settings-tab="${tab}"]`)?.click();
  };

  if (!settingsBtn || !settingsModal) return { openSettingsTab };

  const elements: DecisionFormElements = {
    protocolEl: document.getElementById('settings-protocol') as HTMLSelectElement,
    modelEl: document.getElementById('settings-model') as HTMLInputElement,
    urlEl: document.getElementById('settings-url') as HTMLInputElement,
    keyEl: document.getElementById('settings-key') as HTMLInputElement,
    revisionEl: document.getElementById('settings-revision') as HTMLInputElement,
    deviceEl: document.getElementById('settings-device') as HTMLSelectElement,
    badgeEl: document.getElementById('settings-status-badge') as HTMLElement,
    formEl: document.getElementById('settings-form') as HTMLFormElement,
    testBtn: document.getElementById('settings-test-btn') as HTMLButtonElement,
    resultEl: document.getElementById('settings-test-result') as HTMLElement,
  };
  const closeBtn = document.getElementById('settings-close-btn') as HTMLButtonElement;
  const settingsTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-settings-tab]'));
  const settingsPanels = Array.from(document.querySelectorAll<HTMLElement>('[data-settings-panel]'));
  const view = { settingsTabs, settingsPanels, badgeEl: elements.badgeEl };

  wireDecisionForm(elements);

  for (const button of settingsTabs) {
    button.addEventListener('click', () => showSettingsTab(button.dataset.settingsTab || 'decision', view));
  }

  settingsBtn.addEventListener('click', async () => {
    window.electronAPI?.setViewportVisibility(false);
    elements.resultEl.className = 'alert alert-ghost alert-sm font-mono text-xs hidden';
    try {
      const { stored, status } = await window.electronAPI!.getDecisionSettings();
      showDecisionStatus(elements, status, stored);
    } catch (err: any) {
      showDecisionStatus(elements, null, null);
      showAlert(elements.resultEl, 'error', `Could not read settings: ${err?.message || err}`);
    }
    void loadJevSettings();
    settingsModal.showModal();
    const activeTab = settingsTabs.find((button) => button.classList.contains('tab-active'))?.dataset.settingsTab;
    if (activeTab) reloadPanel(activeTab);
  });

  settingsModal.addEventListener('close', () => {
    closeWrapWrapperModal();
    window.electronAPI?.setViewportVisibility(true);
  });

  closeBtn.addEventListener('click', () => settingsModal.close());

  return { openSettingsTab };
}
