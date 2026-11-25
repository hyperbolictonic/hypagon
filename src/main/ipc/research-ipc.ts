/**
 * The `research:*` IPC surface.
 *
 * Why a module: the research run, citation relocation and the stealth settings
 * all read the same chassis surfaces and the same settings store. The entry
 * point should wire them, not spell out each handler.
 */
import { ipcMain } from 'electron';
import type { BrowserChassis } from '../browser-chassis.js';
import type { ResearchSettingsStore } from '../research/settings.js';

/** When to use: once at startup — the settings store is created by the boot, not here. */
export interface ResearchIpcDeps {
  chassis: BrowserChassis;
  /** The active research settings store, or null before boot. */
  settings: () => ResearchSettingsStore | null;
}

/** When to use: once at startup, before the first window exists. */
export function registerResearchIpc({ chassis, settings }: ResearchIpcDeps): void {
  // ---- research run IPC (streams events on 'research:event') --------------------------------
  ipcMain.handle('research:run', (_event, opts: any) => chassis.crawl.researchTopic(opts ?? {}));
  ipcMain.handle('research:relocate', (_event, opts: any) => chassis.researchView.relocateCitation(opts ?? {}));
  ipcMain.handle('research:revalidate', (_event, opts: any) => chassis.researchView.revalidateStored(opts ?? {}));

  ipcMain.handle('research:settings:get', () => {
    const store = settings();
    return store
      ? store.load()
      : {
          schemaVersion: 1,
          enabled: false,
          engineChain: [],
          urlTemplate: '',
          proxyUrl: '',
          domainCooldownSec: 300,
          delayMs: 1000,
          activateView: true,
        };
  });

  ipcMain.handle('research:settings:save', async (_event, next: any) => {
    const store = settings();
    if (!store) return { ok: false, settings: null, errors: ['Research settings are not ready yet.'] };
    const result = store.save(next);
    if (result.ok) await chassis.research.setSettings(result.settings);
    return result;
  });

  ipcMain.handle('research:session:reset', async () => {
    try {
      await chassis.research.reset();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
}
