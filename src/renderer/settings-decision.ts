/**
 * The decision-model settings tab: protocol, model, endpoint, key, revision and device.
 *
 * Owns its elements (including the status badge), its status painter and its handlers. The modal
 * shell calls `loadDecisionSettings()` on open and `setDecisionBadgeVisible()` when the tab
 * changes, so no decision state stays in the entry point.
 */
import { showSettingsResult } from './settings-feedback';

/** When to use: main's decision-tab mirror, so a saved config can reveal or hide the tab. */
let tabVisible: (visible: boolean, status?: any) => void = () => {};

/** When to use: once at boot, with the entry point's `setDecisionTabVisible`. */
export function setDecisionTabSink(fn: (visible: boolean, status?: any) => void): void {
  tabVisible = fn;
}

  const protocolEl = document.getElementById('settings-protocol') as HTMLSelectElement;
  const modelEl = document.getElementById('settings-model') as HTMLInputElement;
  const urlEl = document.getElementById('settings-url') as HTMLInputElement;
  const keyEl = document.getElementById('settings-key') as HTMLInputElement;
  const revisionEl = document.getElementById('settings-revision') as HTMLInputElement;
  const deviceEl = document.getElementById('settings-device') as HTMLSelectElement;
  const badgeEl = document.getElementById('settings-status-badge') as HTMLElement;
  const formEl = document.getElementById('settings-form') as HTMLFormElement;
  const testBtn = document.getElementById('settings-test-btn') as HTMLButtonElement;

/** When to use: the tab switcher — the status badge belongs to the decision tab only. */
export function setDecisionBadgeVisible(visible: boolean): void {
  badgeEl.classList.toggle('hidden', !visible);
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

/** When to use: the settings modal opens — read the stored decision config and paint the status. */
export async function loadDecisionSettings(): Promise<void> {
  try {
    const { stored, status } = await window.electronAPI!.getDecisionSettings();
    showStatus(status, stored);
  } catch (err: any) {
    showStatus(null, null);
    showSettingsResult('error', `Could not read settings: ${err?.message || err}`);
  }
}

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
      tabVisible(Boolean(saved?.status?.configured), saved?.status);
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
