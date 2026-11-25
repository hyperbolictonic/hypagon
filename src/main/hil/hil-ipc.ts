/**
 * The `hil:*` renderer IPC channels.
 *
 * Why a module: four handlers, each a one-line delegation to the manager. The
 * module takes the four operations it needs, so the manager's public surface
 * stays the API rather than the IPC wiring.
 */
import { ipcMain } from 'electron';
import type { HilRequest } from './hil-types.js';

/** When to use: `HilManager` — the four operations the HUD can invoke. */
export interface HilIpcTarget {
  active(): HilRequest | null;
  resolve(id?: string, notes?: string): boolean;
  cancel(id?: string): boolean;
  reload(): boolean;
}

/** When to use: the manager constructor — registers the hand-off channels once. */
export function registerHilIpc(target: HilIpcTarget): void {
  ipcMain.handle('hil:get-active', () => {
    return target.active();
  });

  ipcMain.handle('hil:resolve', (_event, data?: { id?: string; notes?: string }) => {
    return target.resolve(data?.id, data?.notes);
  });

  ipcMain.handle('hil:cancel', (_event, data?: { id?: string }) => {
    return target.cancel(data?.id);
  });

  ipcMain.handle('hil:reload', () => target.reload());
}
