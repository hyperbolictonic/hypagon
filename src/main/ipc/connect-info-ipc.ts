/**
 * The `app:connect-info` IPC surface.
 *
 * Why a module: the Settings → Connect panel needs the bridge port, the three
 * packaged server paths and the wrap token location. Assembling that from the
 * entry point meant the boot file imported `fs`, `os` and the token helpers
 * only for this one response.
 */
import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import { APP_VERSION } from '../../shared/version.js';
import { tokenPathIn } from '../security/capability-token.js';
import { dataPath } from '../data-paths.js';
import type { ConnectInfo } from '../../shared/connect-info.js';

/** When to use: once at startup — the path resolvers are owned by the entry point. */
export interface ConnectInfoDeps {
  bridgePort: number;
  mcpServerPath: () => string;
  wrapServerPath: () => string;
  devlogsServerPath: () => string;
  wrapDir: () => string;
}

/** When to use: once at startup, before the first window exists. */
export function registerConnectInfoIpc(deps: ConnectInfoDeps): void {
  ipcMain.handle('app:connect-info', (): ConnectInfo => {
    const serverPath = deps.mcpServerPath();
    const wrapServerPath = deps.wrapServerPath();
    const devlogsServerPath = deps.devlogsServerPath();
    return {
      platform: process.platform,
      version: APP_VERSION,
      bridgeUrl: `http://127.0.0.1:${deps.bridgePort}`,
      bridgePort: deps.bridgePort,
      serverPath,
      serverExists: fs.existsSync(serverPath),
      wrapServerPath,
      wrapServerExists: fs.existsSync(wrapServerPath),
      devlogsServerPath,
      devlogsServerExists: fs.existsSync(devlogsServerPath),
      devlogsDir: dataPath('logs'),
      devMode: !app.isPackaged,
      wrapTokenFile: tokenPathIn(deps.wrapDir()),
      runtimePath: process.execPath,
      packaged: app.isPackaged,
      homedir: os.homedir(),
    };
  });
}
