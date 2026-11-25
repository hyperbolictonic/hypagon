/**
 * The `wrap:*` IPC surface.
 *
 * Hypagon REST secrets are written only here, from the Settings renderer. No
 * bridge route or MCP tool can create, read or bind a credential value. The
 * store, secret store and audit log are created by the boot, so this module
 * takes getters.
 */
import { ipcMain } from 'electron';
import type { WrapStore } from '../wrap/store.js';
import type { SecretStore } from '../wrap/secrets.js';
import type { WrapAuditLog } from '../wrap/audit.js';

/** When to use: once at startup — every dependency is live only after boot. */
export interface WrapIpcDeps {
  store: () => WrapStore | null;
  secrets: () => SecretStore | null;
  audit: () => WrapAuditLog | null;
}

const NOT_READY = { available: false, warning: 'Hypagon REST is not ready yet.', secrets: [] } as const;

/** When to use: once at startup, before the first window exists. */
export function registerWrapIpc({ store, secrets, audit }: WrapIpcDeps): void {
  ipcMain.handle('wrap:secrets:list', () => {
    const secretStore = secrets();
    if (!secretStore) return NOT_READY;
    return {
      available: secretStore.available(),
      warning: secretStore.warning(),
      secrets: secretStore.list(),
    };
  });

  ipcMain.handle('wrap:secrets:set', (_event, input: any) => {
    const secretStore = secrets();
    if (!secretStore) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
    return secretStore.set(input || {});
  });

  ipcMain.handle('wrap:secrets:delete', (_event, name: string) => {
    const secretStore = secrets();
    if (!secretStore) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
    const deleted = secretStore.delete(String(name || ''));
    return deleted ? { ok: true, errors: [] } : { ok: false, errors: [`No secret named "${name || ''}".`] };
  });

  ipcMain.handle('wrap:audit:list', (_event, limit?: number) => {
    const log = audit();
    return log ? log.list(Number(limit) || 50) : [];
  });

  // Wrapper editing from Settings. The store validates and normalises every
  // save; the bridge and MCP use the same files.
  ipcMain.handle('wrap:wrappers:list', () => {
    const wrapperStore = store();
    return wrapperStore ? wrapperStore.list() : [];
  });

  ipcMain.handle('wrap:wrappers:save', (_event, wrapper: any) => {
    const wrapperStore = store();
    if (!wrapperStore) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
    const id = typeof wrapper?.id === 'string' ? wrapper.id : '';
    const exists = Boolean(id && wrapperStore.get(id));
    return exists ? wrapperStore.update(wrapper) : wrapperStore.create(wrapper);
  });

  ipcMain.handle('wrap:wrappers:delete', (_event, id: string) => {
    const wrapperStore = store();
    if (!wrapperStore) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
    const wrapperId = String(id || '');
    const deleted = wrapperStore.delete(wrapperId);
    return deleted ? { ok: true, errors: [] } : { ok: false, errors: [`No wrapper named "${wrapperId}".`] };
  });
}
