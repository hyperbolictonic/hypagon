/**
 * Electron main entry point.
 *
 * Process-level setup (profile directory, broken-pipe guard, migration, single-instance lock)
 * runs here, before anything reads `userData` or creates a window. The work itself lives in
 * `bootstrap/`: IPC channels in `ipc-*.ts`, the shell window in `window.ts`, the services it
 * starts in `services.ts`, and the shared mutable state in `state.ts`.
 */
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { BrowserChassis } from './browser-chassis.js';
import { logMainEvent } from './diagnostics/main-log.js';
import { migrateLegacyUserData } from './migrate-user-data.js';
import { state } from './bootstrap/state.js';
import { registerMiscIpc } from './bootstrap/ipc-misc.js';
import { registerMediaIpc } from './bootstrap/ipc-media.js';
import { registerWrapIpc } from './bootstrap/ipc-wrap.js';
import { registerSettingsIpc } from './bootstrap/ipc-settings.js';
import { registerRemoteIpc } from './bootstrap/ipc-remote.js';
import { createMainWindow } from './bootstrap/window.js';

/**
 * Opt-in profile directory, so a dev run can coexist with an installed one.
 *
 * Electron scopes the single-instance lock to `userData`, and both builds derive
 * that path from the same package name. Without an override, starting `npm run
 * dev` while the installed app runs just focuses the installed window (or exits
 * on the lock), and both would race for the bridge port. This must run before
 * the lock request and before anything reads `getPath('userData')`.
 */
const userDataOverride = (process.env.HB_USER_DATA_DIR ?? process.env.KUANG_USER_DATA_DIR)?.trim();
if (userDataOverride) {
  const resolved = path.resolve(userDataOverride);
  app.setPath('userData', resolved);
  // `sessionData` normally follows `userData`; name it so Chromium's caches move too.
  app.setPath('sessionData', resolved);
}

/**
 * A dev run is usually launched from a terminal that can close (or be killed) underneath it.
 * When that pipe breaks, every later console.log throws EPIPE and the app dies with a stack trace
 * that has nothing to do with the page it was driving. A broken console is not an application
 * error: swallow EPIPE/ERR_STREAM_DESTROYED and keep working.
 */
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (err: NodeJS.ErrnoException) => {
    if (err?.code === 'EPIPE' || err?.code === 'ERR_STREAM_DESTROYED' || err?.code === 'ECONNRESET') return;
    // Anything else is unusual but still must not take the browser process down.
  });
}

// Import a pre-rebrand profile before anything creates an empty userData directory: Electron
// derives that path from `productName`, so the rename would otherwise start every existing user
// with no settings, no Cortex database and no stored tokens.
if (app.isPackaged) {
  try {
    migrateLegacyUserData(app.getPath('appData'), app.getName());
  } catch {
    // A failed migration must never block startup; a fresh profile is still usable.
  }
}

/**
 * Windows routes a toast's click back to the process that owns its AppUserModelID.
 * electron-builder stamps the installed shortcuts with the `appId` from
 * `electron-builder.json`; the running app must claim the same ID or the OS cannot
 * match the activation and clicking a HIL notification does nothing (the handler in
 * `hil-manager.ts` never fires). In an unpackaged dev run there is no shortcut, so
 * Electron's guidance applies: attribute toasts to the executable.
 */
if (process.platform === 'win32') {
  app.setAppUserModelId(app.isPackaged ? 'com.hyperbolictonic.kuang-grade-mark-eleven' : process.execPath);
}

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

const chassis = new BrowserChassis();

// GPU/utility process exits are invisible in the UI when they leave a window
// unpainted. Record them so the next white-screen report has a cause.
app.on('child-process-gone', (_event, details) => {
  logMainEvent('child-process-gone', {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
    serviceName: (details as { serviceName?: string }).serviceName,
    name: (details as { name?: string }).name,
  });
  chassis.reassertViewport();
});

const configuredPort = Number(process.env.HB_BRIDGE_PORT ?? process.env.KUANG_BRIDGE_PORT);
const bridgePort = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 4111;
const configuredRemotePort = Number(process.env.HB_REMOTE_PORT);
const remotePort =
  Number.isInteger(configuredRemotePort) && configuredRemotePort > 0 && configuredRemotePort <= 65_535
    ? configuredRemotePort
    : bridgePort + 1;

// The Cyberdeck is driven while the human's editor/terminal owns the foreground, so the
// window is routinely *occluded*. Chromium then stops producing frames for it, which
// silently breaks anything driven by rendering: scroll events never fire (so lazy-loading
// "infinite" feeds never append), IntersectionObserver callbacks never run, and rAF-based
// hydration stalls. Disable occlusion/renderer backgrounding so a driving agent sees the
// same page a foregrounded human would.
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

app.on('second-instance', () => {
  const mainWindow = state.mainWindow;
  if (mainWindow) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

// IPC handlers are registered once, not per window: the renderer may call any of them before
// the services exist, and each handler answers "not ready yet" until then.
registerMiscIpc(chassis);
registerMediaIpc();
registerWrapIpc(bridgePort);
registerSettingsIpc(chassis);
registerRemoteIpc();

app.whenReady().then(() => createMainWindow(chassis, bridgePort, remotePort));

let remoteShutdownStarted = false;
app.on('before-quit', () => {
  state.media?.shutdown();
});
app.on('before-quit', (event) => {
  if (!state.remote || !state.remote.isRunning() || remoteShutdownStarted) return;
  event.preventDefault();
  remoteShutdownStarted = true;
  void state.remote.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow(chassis, bridgePort, remotePort);
  }
});
