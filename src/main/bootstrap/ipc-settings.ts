/**
 * Settings IPC: zoom, research, Shadow Walk, experimental flags and JEV.
 *
 * These are the channels that change behaviour for the next call rather than for the current
 * page, so each one re-applies the policy to the chassis immediately after saving.
 */
import { app, ipcMain } from 'electron';
import path from 'node:path';
import type { BrowserChassis } from '../browser-chassis.js';
import { ResearchSettingsStore } from '../research/settings.js';
import { ZoomSettingsStore } from '../zoom/settings.js';
import type { ZoomMode } from '../../shared/zoom.js';
import { DEFAULT_SHADOW_WALK_SETTINGS, loadShadowWalkSettings, saveShadowWalkSettings } from '../shadow-walk/settings.js';
import { ExperimentalSettingsStore } from '../settings/experimental.js';
import { JevSettingsStore } from '../settings/jev.js';
import { decisionStatus } from '../decide/decision-client.js';
import { state } from './state.js';

/** Experimental feature flags (Settings → Experimental). Persisted; default off. */
let experimentalStore: ExperimentalSettingsStore | null = null;
/** When to use: reading the experimental feature flags from the IPC handlers and the service wiring. */
export function experimentalSettings(): ExperimentalSettingsStore {
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

/** When to use: giving the chassis the JEV availability/enforcement policy. */
export function jevPolicy(): { available: boolean; enforce: boolean } {
  const settings = jevSettings().get();
  const available = settings.power && decisionStatus().configured;
  return { available, enforce: available && settings.mode === 'enforce' };
}

function jevPayload(): { settings: ReturnType<JevSettingsStore['get']>; available: boolean; decisionConfigured: boolean; mode: 'prefer' | 'enforce' } {
  const settings = jevSettings().get();
  return {
    settings,
    available: jevAvailable(),
    decisionConfigured: decisionStatus().configured,
    mode: settings.mode,
  };
}

/** When to use: once at boot — registers the settings channels and applies their policy. */
export function registerSettingsIpc(chassis: BrowserChassis): void {
// Research / stealth settings. These affect search_web, deep_crawl, and
// research_topic; proxy/session changes stay in main.
ipcMain.handle('chassis:zoom:mode', (_event, mode: unknown) => {
  const next: ZoomMode = mode === 'native' ? 'native' : 'compensate';
  if (!state.zoom) {
    state.zoom = new ZoomSettingsStore(path.join(app.getPath('userData'), 'zoom-settings.json'));
  }
  state.zoom.savePatch({ mode: next });
  return chassis.setZoom({ mode: next });
});

ipcMain.handle('research:settings:get', () => {
  return state.research
    ? state.research.load()
    : { schemaVersion: 1, enabled: false, engineChain: [], urlTemplate: '', proxyUrl: '', domainCooldownSec: 300, delayMs: 1000, activateView: true };
});

ipcMain.handle('research:settings:save', async (_event, settings: any) => {
  if (!state.research) return { ok: false, settings: null, errors: ['Research settings are not ready yet.'] };
  const result = state.research.save(settings);
  if (result.ok) await chassis.setResearchSettings(result.settings);
  return result;
});

// Shadow Walk settings: written over IPC only, read by the bridge on every guarded call.
ipcMain.handle('shadowwalk:settings:get', () => loadShadowWalkSettings());
ipcMain.handle('shadowwalk:settings:save', async (_event, settings: any) => {
  const result = saveShadowWalkSettings(settings);
  if (result.ok) await chassis.applyShadowWalkSettings();
  return result;
});
ipcMain.handle('shadowwalk:settings:reset', async () => {
  const result = saveShadowWalkSettings(DEFAULT_SHADOW_WALK_SETTINGS);
  if (result.ok) await chassis.applyShadowWalkSettings();
  return result;
});
ipcMain.handle('shadowwalk:detect', () => chassis.detectShadowPatch());

ipcMain.handle('research:session:reset', async () => {
  try {
    await chassis.resetResearchSession();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});

ipcMain.handle('settings:get-experimental', () => ({ ok: true, settings: experimentalSettings().get() }));
ipcMain.handle('settings:save-experimental', (_event, patch: unknown) => {
  const settings = experimentalSettings().savePatch(patch);
  chassis.broadcast('experimental:settings', settings);
  // Turning the gate off must also leave collab mode and drop page highlights.
  if (!settings.collab) {
    chassis.setCollabMode(false);
    void state.collaboration?.refreshOverlay();
  }
  return { ok: true, settings };
});

ipcMain.handle('settings:get-jev', () => ({ ok: true, ...jevPayload() }));
ipcMain.handle('settings:save-jev', (_event, patch: unknown) => {
  jevSettings().savePatch(patch);
  chassis.broadcast('jev:settings', jevSettings().get());
  return { ok: true, ...jevPayload() };
});
}
