/**
 * The `media:*` IPC surface.
 *
 * Why a module: five handlers repeat the same not-ready guard around the media
 * service, and two are just directory pickers. The service is created by the
 * boot, so the entry point passes a getter instead of the instance.
 */
import { dialog, ipcMain } from 'electron';
import type { MediaService } from '../media/service.js';

const NOT_READY = { ok: false, error: 'Media is not ready yet.' } as const;

/** When to use: once at startup — reads the service lazily, because boot creates it. */
export function registerMediaIpc(getMedia: () => MediaService | null): void {
  // Human-only; the bridge may read the result.
  ipcMain.handle('media:settings:get', () => {
    const media = getMedia();
    return media ? { ok: true, ...media.settingsSnapshot() } : NOT_READY;
  });
  ipcMain.handle('media:settings:save', (_event, patch: unknown) => {
    const media = getMedia();
    return media ? { ok: true, ...media.saveMediaSettings(patch) } : NOT_READY;
  });
  ipcMain.handle('media:update:check', async () => {
    const media = getMedia();
    return media ? { ok: true, updater: await media.checkForUpdate(true) } : NOT_READY;
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
    const media = getMedia();
    return media ? { ok: true, ffmpeg: await media.ffmpegInfo(true) } : NOT_READY;
  });
  ipcMain.handle('media:ffmpeg:install', async () => {
    const media = getMedia();
    return media ? { ok: true, ffmpeg: await media.installFfmpeg() } : NOT_READY;
  });
}
