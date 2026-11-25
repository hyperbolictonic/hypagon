/**
 * The `collaboration:*` IPC surface.
 *
 * Why a module: the thread list and the in-page picker both need the live
 * service, which the boot creates. The entry point passes a getter, so the
 * handlers stay one-liners and the boot file stops owning collab.
 */
import { ipcMain } from 'electron';
import type { BrowserChassis } from '../browser-chassis.js';
import type { CollaborationService } from '../collaboration/service.js';

/** When to use: once at startup — the service is live only after boot. */
export interface CollaborationIpcDeps {
  chassis: BrowserChassis;
  service: () => CollaborationService | null;
}

/** When to use: once at startup, before the first window exists. */
export function registerCollaborationIpc({ chassis, service }: CollaborationIpcDeps): void {
  ipcMain.handle('collaboration:list', (_event, filter?: any) => {
    const collaboration = service();
    if (!collaboration) return { ok: false, threads: [], error: 'Collaboration is not ready yet.' };
    try {
      return { ok: true, threads: collaboration.list(filter || {}) };
    } catch (error: any) {
      return { ok: false, threads: [], error: error?.message || String(error) };
    }
  });

  ipcMain.handle('collaboration:start-picker', async () => {
    try {
      const target = await chassis.collaboration.pickTarget();
      return { ok: true, target };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  });
}
