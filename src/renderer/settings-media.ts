/**
 * Media capture settings (Settings -> Media).
 *
 * Owns the downloader interval, session-cookie switch, output directory and
 * the managed ffmpeg status/install controls.
 */
import type { ElectronAPI } from '../preload/index.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

const settingsMediaForm = document.getElementById('settings-media-form') as HTMLFormElement | null;
const settingsMediaStatus = document.getElementById('settings-media-status') as HTMLElement | null;
const settingsMediaAuto = document.getElementById('settings-media-auto') as HTMLInputElement | null;
const settingsMediaInterval = document.getElementById('settings-media-interval') as HTMLInputElement | null;
const settingsMediaCheck = document.getElementById('settings-media-check') as HTMLButtonElement | null;
const settingsMediaCookies = document.getElementById('settings-media-cookies') as HTMLInputElement | null;
const settingsMediaDir = document.getElementById('settings-media-dir') as HTMLInputElement | null;
const settingsMediaDirBrowse = document.getElementById('settings-media-dir-browse') as HTMLButtonElement | null;
const settingsMediaFfmpegMode = document.getElementById('settings-media-ffmpeg-mode') as HTMLSelectElement | null;
const settingsMediaFfmpegPath = document.getElementById('settings-media-ffmpeg-path') as HTMLInputElement | null;
const settingsMediaFfmpegBrowse = document.getElementById('settings-media-ffmpeg-browse') as HTMLButtonElement | null;
const settingsMediaFfmpegInstall = document.getElementById('settings-media-ffmpeg-install') as HTMLButtonElement | null;
const settingsMediaFfmpegStatus = document.getElementById('settings-media-ffmpeg-status') as HTMLElement | null;
const settingsMediaResult = document.getElementById('settings-media-result') as HTMLElement | null;

function renderMediaUpdater(state: any) {
  if (!state) return;
  if (settingsMediaStatus) {
    const version = state.installedVersion ? `downloader ${state.installedVersion}` : 'downloader missing';
    settingsMediaStatus.textContent = state.lastError ? 'update error' : version;
    settingsMediaStatus.className = state.lastError
      ? 'badge badge-error badge-sm font-mono text-xs whitespace-nowrap'
      : 'badge badge-ghost font-mono text-xs whitespace-nowrap';
  }
  if (!settingsMediaResult) return;
  if (state.lastError) {
    settingsMediaResult.textContent = `Last check failed: ${state.lastError}`;
  } else if (state.updateAvailable) {
    settingsMediaResult.textContent = `Downloader ${state.latestVersion} is available; it installs on the next check.`;
  } else if (state.lastUpdatedAt) {
    settingsMediaResult.textContent = `Updated ${new Date(state.lastUpdatedAt).toLocaleString()}.`;
  } else if (state.lastCheckedAt) {
    settingsMediaResult.textContent = `Up to date (checked ${new Date(state.lastCheckedAt).toLocaleTimeString()}).`;
  } else {
    settingsMediaResult.textContent = 'No check yet.';
  }
}

function renderFfmpegStatus(ffmpeg: any) {
  if (!settingsMediaFfmpegStatus) return;
  if (!ffmpeg) {
    settingsMediaFfmpegStatus.textContent = 'ffmpeg status unavailable.';
    return;
  }
  if (ffmpeg.installing) {
    settingsMediaFfmpegStatus.textContent = 'Installing ffmpeg…';
    return;
  }
  if (ffmpeg.available) {
    settingsMediaFfmpegStatus.textContent = `ffmpeg ${ffmpeg.version} · ${ffmpeg.source}`;
  } else {
    settingsMediaFfmpegStatus.textContent = ffmpeg.error || 'ffmpeg not found; merging and transcoding are unavailable.';
  }
}

async function loadFfmpegStatus() {
  try {
    const result = await api!.getFfmpegStatus();
    if (result?.ok) renderFfmpegStatus(result.ffmpeg);
  } catch {
    // Status is informative; never block the pane on it.
  }
}

/** Read the media settings and ffmpeg status and paint the form. */
export async function loadMediaSettings() {
  try {
    const result = await api!.getMediaSettings();
    if (!result?.ok) {
      if (settingsMediaResult) settingsMediaResult.textContent = result?.error || 'Media is not ready yet.';
      return;
    }
    if (settingsMediaAuto) settingsMediaAuto.checked = result.settings?.autoUpdate !== false;
    if (settingsMediaInterval) settingsMediaInterval.value = String(result.settings?.updateIntervalMinutes ?? 60);
    if (settingsMediaCookies) settingsMediaCookies.checked = result.settings?.useSessionCookies === true;
    if (settingsMediaDir) settingsMediaDir.value = result.settings?.outputDir || '';
    if (settingsMediaFfmpegMode) settingsMediaFfmpegMode.value = result.settings?.ffmpegMode || 'auto';
    if (settingsMediaFfmpegPath) settingsMediaFfmpegPath.value = result.settings?.ffmpegPath || '';
    renderMediaUpdater(result.updater);
    void loadFfmpegStatus();
  } catch (err: any) {
    if (settingsMediaResult) settingsMediaResult.textContent = `Could not read media settings: ${err?.message || err}`;
  }
}

async function saveMediaSettings(patch: {
  autoUpdate?: boolean;
  updateIntervalMinutes?: number;
  useSessionCookies?: boolean;
  outputDir?: string;
  ffmpegMode?: 'auto' | 'path' | 'managed';
  ffmpegPath?: string;
}) {
  try {
    const result = await api!.saveMediaSettings(patch);
    if (!result?.ok) {
      if (settingsMediaResult) settingsMediaResult.textContent = result?.error || 'Could not save media settings.';
      return;
    }
    if (result.settings) {
      if (settingsMediaAuto) settingsMediaAuto.checked = result.settings.autoUpdate;
      if (settingsMediaInterval) settingsMediaInterval.value = String(result.settings.updateIntervalMinutes);
      if (settingsMediaCookies) settingsMediaCookies.checked = result.settings.useSessionCookies;
      if (settingsMediaDir) settingsMediaDir.value = result.settings.outputDir || '';
      if (settingsMediaFfmpegMode) settingsMediaFfmpegMode.value = result.settings.ffmpegMode;
      if (settingsMediaFfmpegPath) settingsMediaFfmpegPath.value = result.settings.ffmpegPath || '';
    }
    renderMediaUpdater(result.updater);
    void loadFfmpegStatus();
  } catch (err: any) {
    if (settingsMediaResult) settingsMediaResult.textContent = `Could not save media settings: ${err?.message || err}`;
  }
}

/** Wire the media form once, after the settings modal markup exists. */
export function initMediaPanel(): void {
  settingsMediaForm?.addEventListener('submit', (event) => event.preventDefault());
  settingsMediaAuto?.addEventListener('change', () => {
    if (settingsMediaAuto) void saveMediaSettings({ autoUpdate: settingsMediaAuto.checked });
  });
  settingsMediaCookies?.addEventListener('change', () => {
    if (settingsMediaCookies) void saveMediaSettings({ useSessionCookies: settingsMediaCookies.checked });
  });
  settingsMediaDirBrowse?.addEventListener('click', async () => {
    const dir = await api!.pickMediaDir();
    if (!dir) return;
    if (settingsMediaDir) settingsMediaDir.value = dir;
    void saveMediaSettings({ outputDir: dir });
  });
  settingsMediaFfmpegMode?.addEventListener('change', () => {
    if (settingsMediaFfmpegMode) {
      void saveMediaSettings({ ffmpegMode: settingsMediaFfmpegMode.value as 'auto' | 'path' | 'managed' });
    }
  });
  settingsMediaFfmpegPath?.addEventListener('change', () => {
    if (settingsMediaFfmpegPath) void saveMediaSettings({ ffmpegPath: settingsMediaFfmpegPath.value.trim() });
  });
  settingsMediaFfmpegBrowse?.addEventListener('click', async () => {
    const file = await api!.pickFfmpegPath();
    if (!file) return;
    if (settingsMediaFfmpegPath) settingsMediaFfmpegPath.value = file;
    void saveMediaSettings({ ffmpegPath: file, ffmpegMode: 'path' });
  });
  settingsMediaFfmpegInstall?.addEventListener('click', async () => {
    if (!settingsMediaFfmpegInstall) return;
    settingsMediaFfmpegInstall.disabled = true;
    if (settingsMediaFfmpegStatus) settingsMediaFfmpegStatus.textContent = 'Downloading ffmpeg (about 60 MB)…';
    try {
      const result = await api!.installFfmpeg();
      if (!result?.ok) {
        if (settingsMediaFfmpegStatus) settingsMediaFfmpegStatus.textContent = result?.error || 'Install failed.';
        return;
      }
      renderFfmpegStatus(result.ffmpeg);
      if (result.ffmpeg) await saveMediaSettings({ ffmpegMode: 'managed' });
    } catch (err: any) {
      if (settingsMediaFfmpegStatus) settingsMediaFfmpegStatus.textContent = `Install failed: ${err?.message || err}`;
    } finally {
      settingsMediaFfmpegInstall.disabled = false;
    }
  });
  settingsMediaInterval?.addEventListener('change', () => {
    if (!settingsMediaInterval) return;
    const value = Number(settingsMediaInterval.value);
    if (Number.isFinite(value)) void saveMediaSettings({ updateIntervalMinutes: Math.round(value) });
  });
  settingsMediaCheck?.addEventListener('click', async () => {
    if (!settingsMediaCheck) return;
    settingsMediaCheck.disabled = true;
    if (settingsMediaResult) settingsMediaResult.textContent = 'Checking…';
    try {
      const result = await api!.checkMediaUpdate();
      if (!result?.ok) {
        if (settingsMediaResult) settingsMediaResult.textContent = result?.error || 'Check failed.';
        return;
      }
      renderMediaUpdater(result.updater);
    } catch (err: any) {
      if (settingsMediaResult) settingsMediaResult.textContent = `Check failed: ${err?.message || err}`;
    } finally {
      settingsMediaCheck.disabled = false;
    }
  });
}
