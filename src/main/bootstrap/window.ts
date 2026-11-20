/**
 * The shell window: creation, HUD diagnostics, the first load, and the service hand-off.
 *
 * The page-zoom policy is loaded before the first tab exists so the initial document renders at
 * the right proportions instead of resizing after load. The window is shown only after the
 * bundle loads, so a slow disk does not paint an empty frame.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserChassis } from '../browser-chassis.js';
import { attachContextMenu } from '../menu/context-menu.js';
import { ZoomSettingsStore } from '../zoom/settings.js';
import { initUpdater, checkForUpdates, installUpdate, updaterState } from '../updates/updater.js';
import { setRecordingWindow, loadRecordingConfig } from '../recording/recording-service.js';
import { BRAND } from '../../shared/brand.js';
import { logMainEvent } from '../diagnostics/main-log.js';
import { state } from './state.js';
import { resolveBrandIcon } from './paths.js';
import { startServices } from './services.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brandIcon = resolveBrandIcon();
let mainWindow: BrowserWindow | null = null;

/** When to use: `app.whenReady` and the macOS activate handler. */
export async function createMainWindow(chassis: BrowserChassis, bridgePort: number, remotePort: number): Promise<void> {
  // Load the page-zoom policy before the first tab exists, so the initial
  // document is rendered at the right proportions rather than resizing after
  // load. Later windows reuse the same store and keep any manual zoom.
  if (!state.zoom) {
    const zoom = new ZoomSettingsStore(path.join(app.getPath('userData'), 'zoom-settings.json'));
    state.zoom = zoom;
    chassis.setZoomSettings(zoom.get());
  }

  mainWindow = new BrowserWindow({
    title: BRAND.windowTitle,
    ...(brandIcon ? { icon: brandIcon } : {}),
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // The HUD is a renderer too. A crash used to leave a permanently white
  // BrowserWindow with no log; record it and reload once so the window recovers.
  const hudContents = mainWindow.webContents;
  hudContents.on('render-process-gone', (_event, details) => {
    logMainEvent('hud-renderer-gone', { reason: details.reason, exitCode: details.exitCode });
    if (details.reason === 'clean-exit') return;
    setTimeout(() => {
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

  chassis.setWindow(mainWindow);
  setRecordingWindow(mainWindow);
  loadRecordingConfig();

  // The shell (HUD) has its own context menu: without it, right-click copy/paste/inspect does
  // nothing anywhere outside a browsing tab. Inspection targets the shell's own renderer.
  attachContextMenu(mainWindow.webContents, {
    window: mainWindow,
    onLog: (level, message) => console.log(`[HUD context menu] ${level}: ${message}`),
  });

  // ---- updates (optional, packaged builds only) -------------------------------------------
  ipcMain.handle('app:update-status', () => updaterState());
  ipcMain.handle('app:update-check', () => checkForUpdates());
  ipcMain.handle('app:update-install', () => installUpdate());
  void initUpdater((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-status', state);
    }
  });

  // Dev server or production bundle
  if (process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.show();
  mainWindow.focus();

  // Apply the persisted Shadow Walk policy (including a force-open kill-switch override) to the
  // initial tab. Current documents are untouched; the patch lands on the next navigation.
  void chassis.applyShadowWalkSettings();

  // Warm Cortex so the first URL-bar suggestion does not pay table initialization on a keystroke.
  void chassis.getCortex().initialize().catch(() => undefined);

  // Handle external navigation
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });


  state.mainWindow = mainWindow;
  await startServices(chassis, bridgePort, remotePort);
}
