/**
 * The `recording:*` IPC surface.
 *
 * Why a module: the recording service is a singleton and every handler is a
 * one-line delegation. Keeping them next to the entry point made the boot file
 * look like it owned recording; it only owns the registration.
 */
import { ipcMain } from 'electron';
import {
  failRecording,
  getRecordingConfig,
  getRecordingStatus,
  listRecordings,
  pickRecordingDir,
  readyRecording,
  saveRecording,
  saveRecordingConfig,
  startRecording,
  stopRecording,
} from '../recording/recording-service.js';

/** When to use: once at startup, before the first window exists. */
export function registerRecordingIpc(): void {
  ipcMain.handle('recording:config:get', () => getRecordingConfig());
  ipcMain.handle('recording:config:save', (_event, config: any) => saveRecordingConfig(config || {}));
  ipcMain.handle('recording:pick-dir', () => pickRecordingDir());
  ipcMain.handle('recording:start', (_event, name?: string) => startRecording(typeof name === 'string' ? name : undefined));
  ipcMain.handle('recording:stop', () => stopRecording());
  ipcMain.handle('recording:status', () => getRecordingStatus());
  ipcMain.handle('recording:list', () => listRecordings());
  ipcMain.handle('recording:save', (_event, buffer: ArrayBuffer, frames: number) => saveRecording(buffer, Number(frames) || 0));
  ipcMain.on('recording:ready', () => readyRecording());
  ipcMain.on('recording:failed', (_event, message: string) => failRecording(String(message || 'Recording failed.')));
}
