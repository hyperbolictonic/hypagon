/**
 * The shell window.
 *
 * Why a module: the entry point used to own the BrowserWindow options, the HUD
 * crash logging, the update IPC and the dev/bundle load inside one
 * `createWindow` body. They are the same four steps for every window, so they
 * live here and the entry point just calls them in order.
 */
import { BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { BRAND } from '../../shared/brand.js';
import { logMainEvent } from '../diagnostics/main-log.js';
import { checkForUpdates, initUpdater, installUpdate, updaterState } from '../updates/updater.js';

/** When to use: creating a shell window — `appDir` is the compiled main directory. */
export interface ShellWindowDeps {
  appDir: string;
  brandIcon?: string;
  /** The current shell window, so a renderer crash reloads the live one. */
  getMainWindow: () => BrowserWindow | null;
}

/**
 * The window itself plus its HUD crash handling. A crashed renderer used to
 * leave a permanently white BrowserWindow with no log; record it and reload
 * once so the window recovers.
 */
export function createShellWindow({ appDir, brandIcon, getMainWindow }: ShellWindowDeps): BrowserWindow {
  const win = new BrowserWindow({
    title: BRAND.windowTitle,
    ...(brandIcon ? { icon: brandIcon } : {}),
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: path.join(appDir, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const hudContents = win.webContents;
  hudContents.on('render-process-gone', (_event, details) => {
    logMainEvent('hud-renderer-gone', { reason: details.reason, exitCode: details.exitCode });
    if (details.reason === 'clean-exit') return;
    setTimeout(() => {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.reload();
        } catch {
          // Window closed while the renderer was restarting.
        }
      }
    }, 700);
  });
  hudContents.on('unresponsive', () => logMainEvent('hud-unresponsive'));
  hudContents.on('responsive', () => logMainEvent('hud-responsive'));
  hudContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => {
    if (isMainFrame) logMainEvent('hud-did-fail-load', { code, description, url });
  });

  return win;
}

/** Update IPC: status, an on-demand check, and install (packaged builds only in practice). */
export function registerUpdateHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('app:update-status', () => updaterState());
  ipcMain.handle('app:update-check', () => checkForUpdates());
  ipcMain.handle('app:update-install', () => installUpdate());
  void initUpdater((state) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-status', state);
    }
  });
}

/** When to use: after the window exists — the dev server URL, or the bundled file. */
export async function loadShell(win: BrowserWindow, appDir: string): Promise<void> {
  if (process.env.VITE_DEV_SERVER_URL) {
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }
  await win.loadFile(path.join(appDir, '../../dist/index.html'));
}
