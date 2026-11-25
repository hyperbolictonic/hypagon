/**
 * The timelapse recorder: the REC toolbar button and Settings → Recording.
 *
 * Why a module: the button, the status light, the elapsed ticker, the settings form and the
 * saved-file list are one feature. `beginRecording`/`finishRecording` stay in `renderer/recording`.
 */
import { beginRecording, finishRecording } from '../recording.js';
import { showAlert } from '../settings-alert.js';

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

function showRecResult(kind: 'success' | 'error' | 'info', text: string): void {
  showAlert(settingsRecResult, kind, text);
}

function stopRecordTicker(): void {
  if (recordTicker !== null) {
    window.clearInterval(recordTicker);
    recordTicker = null;
  }
}

function applyRecordingStatus(state: any): void {
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

async function refreshRecordingList(): Promise<void> {
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

/** When to use: opening the Recording settings tab. */
export async function loadRecordingSettings(): Promise<void> {
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

/**
 * When to use: the HUD boot — wire the REC button, the settings form and the begin/stop events.
 * `openSettingsTab` opens Settings on a named tab, which the settings modal owns.
 */
export function initRecordingPanel(deps: { openSettingsTab: (tab: 'decision' | 'recording') => void }): void {
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
        deps.openSettingsTab('recording');
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
}
