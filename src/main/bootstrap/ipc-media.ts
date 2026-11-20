/**
 * Media settings IPC (human-only; the bridge may read the result).
 *
 * The service is created after the window loads, so every handler answers "not ready yet"
 * until then rather than throwing.
 */
import { dialog, ipcMain } from 'electron';
import { state } from './state.js';

/** When to use: once at boot — registers the `media:*` channels. */
export function registerMediaIpc(): void {
// ---- media settings IPC (human-only; the bridge may read the result) ------------------------
ipcMain.handle('media:settings:get', () => {
  if (!state.media) return { ok: false, error: 'Media is not ready yet.' };
  return { ok: true, ...state.media.settingsSnapshot() };
});
ipcMain.handle('media:settings:save', (_event, patch: unknown) => {
  if (!state.media) return { ok: false, error: 'Media is not ready yet.' };
  return { ok: true, ...state.media.saveMediaSettings(patch) };
});
ipcMain.handle('media:update:check', async () => {
  if (!state.media) return { ok: false, error: 'Media is not ready yet.' };
  return { ok: true, updater: await state.media.checkForUpdate(true) };
});
ipcMain.handle('media:pick-dir', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});
ipcMain.handle('media:pick-ffmpeg', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
});
ipcMain.handle('media:ffmpeg:status', async () => {
  if (!state.media) return { ok: false, error: 'Media is not ready yet.' };
  return { ok: true, ffmpeg: await state.media.ffmpegInfo(true) };
});
ipcMain.handle('media:ffmpeg:install', async () => {
  if (!state.media) return { ok: false, error: 'Media is not ready yet.' };
  return { ok: true, ffmpeg: await state.media.installFfmpeg() };
});
}
