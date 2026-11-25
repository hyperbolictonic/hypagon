import { reassertChassisViewport } from './chassis/accessors.js';
import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserChassis } from './browser-chassis.js';
import { ZoomSettingsStore } from './zoom/settings.js';
import { attachContextMenu } from './menu/context-menu.js';
import { registerRemoteIpc } from './remote/ipc.js';
import { brandIconPath } from './brand-icon.js';
import { ExperimentalSettingsStore } from './settings/experimental.js';
import { JevSettingsStore } from './settings/jev.js';
import { decisionStatus } from './decide/decision-client.js';
import { logMainEvent } from './diagnostics/main-log.js';
import { migrateLegacyUserData } from './migrate-user-data.js';
import { loadRecordingConfig, onRecordingStatus, setRecordingWindow } from './recording/recording-service.js';
import type { SecretCipher } from './wrap/secrets.js';
import { AppServices } from './boot/services.js';
import { createShellWindow, loadShell, registerUpdateHandlers } from './boot/shell-window.js';
import { registerRecordingIpc } from './ipc/recording-ipc.js';
import { registerResearchIpc } from './ipc/research-ipc.js';
import { registerMediaIpc } from './ipc/media-ipc.js';
import { registerWrapIpc } from './ipc/wrap-ipc.js';
import { registerSettingsIpc } from './ipc/settings-ipc.js';
import type { JevPayload } from './ipc/settings-ipc.js';
import { registerCollaborationIpc } from './ipc/collaboration-ipc.js';
import { registerWebStateIpc } from './ipc/web-state-ipc.js';
import { registerConnectInfoIpc } from './ipc/connect-info-ipc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
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
  reassertChassisViewport(chassis);
});

const configuredPort = Number(process.env.HB_BRIDGE_PORT ?? process.env.KUANG_BRIDGE_PORT);
const bridgePort = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 4111;
const configuredRemotePort = Number(process.env.HB_REMOTE_PORT);
const remotePort =
  Number.isInteger(configuredRemotePort) && configuredRemotePort > 0 && configuredRemotePort <= 65_535
    ? configuredRemotePort
    : bridgePort + 1;

/**
 * A stable path to the stdio MCP server for generated client configs.
 *
 * Installed builds copy the asar-unpacked file into userData: `resources/` is temporary for
 * portable and AppImage builds, so a config pointing inside it would break after the app exits.
 * The copy is refreshed whenever the bundled file is newer (i.e. after an update).
 */
const cachedServerPaths = new Map<string, string>();
function ensureBundledServerPath(filename: string): string {
  const cached = cachedServerPaths.get(filename);
  if (cached) return cached;

  const devPath = path.join(app.getAppPath(), 'bin', filename);
  if (!app.isPackaged) {
    cachedServerPaths.set(filename, devPath);
    return devPath;
  }

  const source = path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', filename);
  const target = path.join(app.getPath('userData'), 'bin', filename);
  let resolved = source;
  try {
    const sourceMtime = fs.statSync(source).mtimeMs;
    const targetMtime = fs.existsSync(target) ? fs.statSync(target).mtimeMs : 0;
    if (targetMtime < sourceMtime) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    resolved = target;
  } catch {
    // Worst case, point at the bundled path: correct for installed (non-portable) builds.
  }
  cachedServerPaths.set(filename, resolved);
  return resolved;
}

function ensureMcpServerPath(): string {
  return ensureBundledServerPath('mcp-server.cjs');
}

function ensureWrapServerPath(): string {
  return ensureBundledServerPath('wrap-server.cjs');
}

function ensureRemoteServerPath(): string {
  return ensureBundledServerPath('remote-server.cjs');
}

function ensureDevlogsServerPath(): string {
  return ensureBundledServerPath('devlogs-server.cjs');
}

function wrapDir(): string {
  return path.join(app.getPath('userData'), 'wrap');
}

function remoteDir(): string {
  return path.join(app.getPath('userData'), 'remote');
}

let activeZoomSettings: ZoomSettingsStore | null = null;

function createSecretCipher(): SecretCipher {
  let available = false;
  let warning = '';
  try {
    available = safeStorage.isEncryptionAvailable();
    const backend =
      process.platform === 'linux' ? String((safeStorage as any).getSelectedStorageBackend?.() || '') : '';
    if (backend === 'basic_text') {
      available = false;
      warning =
        'The Linux keyring is reporting basic_text, which is not encryption. Install a keyring (GNOME Keyring or KWallet) and restart to enable secrets.';
    } else if (!available) {
      warning = 'OS-backed encryption is unavailable in this session, so secrets are disabled.';
    }
  } catch (err: any) {
    warning = `OS-backed encryption is unavailable: ${err?.message || err}`;
  }

  return {
    available: () => available,
    warning,
    encrypt: (value: string) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (payload: string) => safeStorage.decryptString(Buffer.from(payload, 'base64')),
  };
}

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

/** Experimental feature flags (Settings → Experimental). Persisted; default off. */
let experimentalStore: ExperimentalSettingsStore | null = null;
function experimentalSettings(): ExperimentalSettingsStore {
  experimentalStore ??= new ExperimentalSettingsStore(path.join(app.getPath('userData'), 'experimental.json'));
  return experimentalStore;
}

/** Optional JEV page compaction (requires a configured decision model). Default off. */
let jevStore: JevSettingsStore | null = null;
/** Settings are written only over IPC; the MCP server reads /tools/config at startup. */
function jevSettings(): JevSettingsStore {
  jevStore ??= new JevSettingsStore(path.join(app.getPath('userData'), 'jev.json'));
  return jevStore;
}
function jevAvailable(): boolean {
  return jevSettings().get().power && decisionStatus().configured;
}

function jevPolicy(): { available: boolean; enforce: boolean } {
  const settings = jevSettings().get();
  const available = settings.power && decisionStatus().configured;
  return { available, enforce: available && settings.mode === 'enforce' };
}

function jevPayload(): JevPayload {
  const settings = jevSettings().get();
  return {
    settings,
    available: jevAvailable(),
    decisionConfigured: decisionStatus().configured,
    mode: settings.mode,
  };
}

function zoomSettings(): ZoomSettingsStore {
  activeZoomSettings ??= new ZoomSettingsStore(path.join(app.getPath('userData'), 'zoom-settings.json'));
  return activeZoomSettings;
}

/** The long-lived services; fields stay null until the first window starts them. */
const services = new AppServices({
  chassis,
  bridgePort,
  remotePort,
  wrapDir,
  remoteDir,
  remoteServerPath: ensureRemoteServerPath,
  secretCipher: createSecretCipher,
  experimental: experimentalSettings,
  jevPolicy,
});

// ---- renderer IPC (registered once, not per window) ----------------------------------------
registerRecordingIpc();
registerResearchIpc({ chassis, settings: () => services.research });
registerMediaIpc(() => services.media);
registerWrapIpc({
  store: () => services.wrapStore,
  secrets: () => services.wrapSecrets,
  audit: () => services.wrapAudit,
});
registerSettingsIpc({
  chassis,
  experimental: experimentalSettings,
  jevSettings,
  jevPayload,
  zoomSettings,
  onCollabDisabled: () => {
    chassis.deck.setCollabMode(false);
    void services.collaboration?.refreshOverlay();
  },
});
registerCollaborationIpc({ chassis, service: () => services.collaboration });
registerWebStateIpc(chassis);
registerConnectInfoIpc({
  bridgePort,
  mcpServerPath: ensureMcpServerPath,
  wrapServerPath: ensureWrapServerPath,
  devlogsServerPath: ensureDevlogsServerPath,
  wrapDir,
});

registerRemoteIpc(() => services.remote);

onRecordingStatus((state) => {
  chassis.bus.broadcast('recording:status', state);
});

/**
 * Window / taskbar icon — the same mark the installer, tray and notifications use.
 *
 * The packaged app reads it from inside the asar; development reads the repo copy.
 */
const brandIcon = brandIconPath();

/** The page-zoom policy must exist before the first tab, so the initial document renders at the right proportions. */
function prepareZoomPolicy(): void {
  if (activeZoomSettings) return;
  chassis.zoom.setSettings(zoomSettings().get());
}

async function createWindow() {
  prepareZoomPolicy();
  mainWindow = createShellWindow({ appDir: __dirname, brandIcon, getMainWindow: () => mainWindow });
  chassis.boot.window(mainWindow);
  setRecordingWindow(mainWindow);
  loadRecordingConfig();

  // The shell (HUD) has its own context menu: without it, right-click copy/paste/inspect does
  // nothing anywhere outside a browsing tab. Inspection targets the shell's own renderer.
  attachContextMenu(mainWindow.webContents, {
    window: mainWindow,
    onLog: (level, message) => console.log(`[HUD context menu] ${level}: ${message}`),
  });

  registerUpdateHandlers(() => mainWindow);
  await loadShell(mainWindow, __dirname);

  mainWindow.show();
  mainWindow.focus();

  // Apply the persisted Shadow Walk policy (including a force-open kill-switch override) to the
  // initial tab. Current documents are untouched; the patch lands on the next navigation.
  void chassis.shadow.applySettings();

  // Warm Cortex so the first URL-bar suggestion does not pay table initialization on a keystroke.
  void chassis.cortex.initialize().catch(() => undefined);

  // Handle external navigation
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Start the autonomous HTTP bridge and the tunnel it exposes to agents. A failure is a
  // logged warning, never a startup crash: the window is already usable.
  try {
    await services.start();
  } catch (err: any) {
    chassis.telemetry.addLog('warn', `HTTP Bridge notice: ${err?.message || err}`);
  }
}

app.whenReady().then(createWindow);

let remoteShutdownStarted = false;
app.on('before-quit', () => {
  services.shutdown();
});
app.on('before-quit', (event) => {
  if (!services.remote || !services.remote.isRunning() || remoteShutdownStarted) return;
  event.preventDefault();
  remoteShutdownStarted = true;
  void services.remote.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
