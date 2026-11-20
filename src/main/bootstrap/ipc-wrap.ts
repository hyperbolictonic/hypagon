/**
 * Hypagon REST IPC: credentials, the audit log, saved wrappers and the connect-info payload.
 *
 * Credential values are written only here, from the Settings renderer. No bridge route or MCP
 * tool can create, read, or bind a value.
 */
import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tokenFile } from '../wrap/token.js';
import { dataPath } from '../data-paths.js';
import { APP_VERSION } from '../../shared/version.js';
import { state } from './state.js';
import { ensureDevlogsServerPath, ensureMcpServerPath, ensureWrapServerPath, wrapDir } from './paths.js';

/** When to use: once at boot — registers every `wrap:*` channel plus `app:connect-info`. */
export function registerWrapIpc(bridgePort: number): void {
// Hypagon REST secrets are written only here, from the Settings renderer. No
// bridge route or MCP tool can create, read, or bind a credential value.
ipcMain.handle('wrap:secrets:list', () => {
  if (!state.wrapSecrets) {
    return { available: false, warning: 'Hypagon REST is not ready yet.', secrets: [] };
  }
  return {
    available: state.wrapSecrets.available(),
    warning: state.wrapSecrets.warning(),
    secrets: state.wrapSecrets.list(),
  };
});

ipcMain.handle('wrap:secrets:set', (_event, input: any) => {
  if (!state.wrapSecrets) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
  return state.wrapSecrets.set(input || {});
});

ipcMain.handle('wrap:secrets:delete', (_event, name: string) => {
  if (!state.wrapSecrets) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
  const deleted = state.wrapSecrets.delete(String(name || ''));
  return deleted ? { ok: true, errors: [] } : { ok: false, errors: [`No secret named "${name || ''}".`] };
});

ipcMain.handle('wrap:audit:list', (_event, limit?: number) => {
  return state.wrapAudit ? state.wrapAudit.list(Number(limit) || 50) : [];
});

// Wrapper editing from Settings. The store validates and normalises every
// save; the bridge and MCP use the same files.
ipcMain.handle('wrap:wrappers:list', () => {
  return state.wrapStore ? state.wrapStore.list() : [];
});

ipcMain.handle('wrap:wrappers:save', (_event, wrapper: any) => {
  if (!state.wrapStore) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
  const id = typeof wrapper?.id === 'string' ? wrapper.id : '';
  const exists = Boolean(id && state.wrapStore.get(id));
  return exists ? state.wrapStore.update(wrapper) : state.wrapStore.create(wrapper);
});

ipcMain.handle('wrap:wrappers:delete', (_event, id: string) => {
  if (!state.wrapStore) return { ok: false, errors: ['Hypagon REST is not ready yet.'] };
  const wrapperId = String(id || '');
  const deleted = state.wrapStore.delete(wrapperId);
  return deleted ? { ok: true, errors: [] } : { ok: false, errors: [`No wrapper named "${wrapperId}".`] };
});

ipcMain.handle('app:connect-info', () => {
  const serverPath = ensureMcpServerPath();
  const wrapServerPath = ensureWrapServerPath();
  const devlogsServerPath = ensureDevlogsServerPath();
  return {
    platform: process.platform,
    version: APP_VERSION,
    bridgeUrl: `http://127.0.0.1:${bridgePort}`,
    bridgePort,
    serverPath,
    serverExists: fs.existsSync(serverPath),
    wrapServerPath,
    wrapServerExists: fs.existsSync(wrapServerPath),
    devlogsServerPath,
    devlogsServerExists: fs.existsSync(devlogsServerPath),
    devlogsDir: dataPath('logs'),
    devMode: !app.isPackaged,
    wrapTokenFile: tokenFile(wrapDir()),
    runtimePath: process.execPath,
    packaged: app.isPackaged,
    homedir: os.homedir(),
  };
});
}
