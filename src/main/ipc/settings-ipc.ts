/**
 * The settings IPC surface: experimental flags, JEV, page zoom, Shadow Walk.
 *
 * Why a module: four unrelated stores are written only from the Settings
 * renderer, and each handler is a save plus a broadcast. Keeping the channels
 * together means the entry point wires them once and never grows a settings
 * handler again.
 */
import { ipcMain } from 'electron';
import type { BrowserChassis } from '../browser-chassis.js';
import type { ExperimentalSettingsStore } from '../settings/experimental.js';
import type { JevSettingsStore } from '../settings/jev.js';
import type { ZoomSettingsStore } from '../zoom/settings.js';
import {
  DEFAULT_SHADOW_WALK_SETTINGS,
  loadShadowWalkSettings,
  saveShadowWalkSettings,
} from '../shadow-walk/settings.js';
import type { ZoomMode } from '../../shared/zoom.js';

/** What Settings → Decision needs to render the JEV panel. */
export interface JevPayload {
  settings: ReturnType<JevSettingsStore['get']>;
  available: boolean;
  decisionConfigured: boolean;
  mode: 'prefer' | 'enforce';
}

/** When to use: once at startup — every store is created lazily by the caller. */
export interface SettingsIpcDeps {
  chassis: BrowserChassis;
  experimental: () => ExperimentalSettingsStore;
  jevSettings: () => JevSettingsStore;
  jevPayload: () => JevPayload;
  zoomSettings: () => ZoomSettingsStore;
  /** Turning the collab gate off must leave collab mode and drop page highlights. */
  onCollabDisabled: () => void;
}

/** When to use: once at startup, before the first window exists. */
export function registerSettingsIpc({
  chassis,
  experimental,
  jevSettings,
  jevPayload,
  zoomSettings,
  onCollabDisabled,
}: SettingsIpcDeps): void {
  ipcMain.handle('settings:get-experimental', () => ({ ok: true, settings: experimental().get() }));
  ipcMain.handle('settings:save-experimental', (_event, patch: unknown) => {
    const settings = experimental().savePatch(patch);
    chassis.bus.broadcast('experimental:settings', settings);
    if (!settings.collab) onCollabDisabled();
    return { ok: true, settings };
  });

  ipcMain.handle('settings:get-jev', () => ({ ok: true, ...jevPayload() }));
  ipcMain.handle('settings:save-jev', (_event, patch: unknown) => {
    jevSettings().savePatch(patch);
    chassis.bus.broadcast('jev:settings', jevSettings().get());
    return { ok: true, ...jevPayload() };
  });

  ipcMain.handle('chassis:zoom:mode', (_event, mode: unknown) => {
    const next: ZoomMode = mode === 'native' ? 'native' : 'compensate';
    zoomSettings().savePatch({ mode: next });
    return chassis.zoom.setZoom({ mode: next });
  });

  // Shadow Walk settings: written over IPC only, read by the bridge on every guarded call.
  ipcMain.handle('shadowwalk:settings:get', () => loadShadowWalkSettings());
  ipcMain.handle('shadowwalk:settings:save', async (_event, settings: any) => {
    const result = saveShadowWalkSettings(settings);
    if (result.ok) await chassis.shadow.applySettings();
    return result;
  });
  ipcMain.handle('shadowwalk:settings:reset', async () => {
    const result = saveShadowWalkSettings(DEFAULT_SHADOW_WALK_SETTINGS);
    if (result.ok) await chassis.shadow.applySettings();
    return result;
  });
  ipcMain.handle('shadowwalk:detect', () => chassis.shadow.detectPatch());
}
