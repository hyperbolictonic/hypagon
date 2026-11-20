/**
 * Recording, research-run, collaboration and page-state IPC.
 *
 * Recording handlers are registered once (not per window) and stream their status through the
 * chassis broadcast. The page-state handler is the Command Deck's WEB STATE tab.
 */
import { ipcMain } from 'electron';
import type { BrowserChassis } from '../browser-chassis.js';
import type { WebPageState } from '../../shared/web-state.js';
import {
  failRecording,
  getRecordingConfig,
  getRecordingStatus,
  listRecordings,
  onRecordingStatus,
  pickRecordingDir,
  readyRecording,
  saveRecording,
  saveRecordingConfig,
  startRecording,
  stopRecording,
} from '../recording/recording-service.js';
import { state } from './state.js';

/** When to use: once at boot — registers recording, research-run, collaboration and web-state. */
export function registerMiscIpc(chassis: BrowserChassis): void {
// ---- recording IPC (registered once, not per window) --------------------------------------
ipcMain.handle('recording:config:get', () => getRecordingConfig());
ipcMain.handle('recording:config:save', (_event, config: any) => saveRecordingConfig(config || {}));
ipcMain.handle('recording:pick-dir', () => pickRecordingDir());
ipcMain.handle('recording:start', (_event, name?: string) => startRecording(typeof name === 'string' ? name : undefined));
ipcMain.handle('recording:stop', () => stopRecording());
ipcMain.handle('recording:status', () => getRecordingStatus());

// ---- research run IPC (streams events on 'research:event') --------------------------------
ipcMain.handle('research:run', (_event, opts: any) => chassis.researchTopic(opts ?? {}));
ipcMain.handle('research:relocate', (_event, opts: any) => chassis.relocateCitation(opts ?? {}));
ipcMain.handle('research:revalidate', (_event, opts: any) => chassis.revalidateStored(opts ?? {}));
ipcMain.handle('recording:list', () => listRecordings());
ipcMain.handle('recording:save', (_event, buffer: ArrayBuffer, frames: number) => saveRecording(buffer, Number(frames) || 0));
ipcMain.on('recording:ready', () => readyRecording());
ipcMain.on('recording:failed', (_event, message: string) => failRecording(String(message || 'Recording failed.')));

ipcMain.handle('collaboration:list', (_event, filter?: any) => {
  if (!state.collaboration) return { ok: false, threads: [], error: 'Collaboration is not ready yet.' };
  try {
    return { ok: true, threads: state.collaboration.list(filter || {}) };
  } catch (error: any) {
    return { ok: false, threads: [], error: error?.message || String(error) };
  }
});

ipcMain.handle('collaboration:start-picker', async () => {
  try {
    const target = await chassis.pickCollaborationTarget();
    return { ok: true, target };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
});

/** Page signals for the Command Deck WEB STATE tab (breadcrumb, cookies, storage). */
ipcMain.handle('chassis:web-state', async () => {
  try {
    const wc = chassis.getActiveWebContents();
    const page = await wc.executeJavaScript(
      '(() => { ' +
      'const crumbs = (location.pathname || "").split("/").filter(Boolean);' +
      'const ls = {}; const ss = {};' +
      'try { for (let i = 0; i < localStorage.length && i < 50; i++) { const k = localStorage.key(i); ls[k] = (localStorage.getItem(k) || "").slice(0, 120); } } catch {}' +
      'try { for (let i = 0; i < sessionStorage.length && i < 50; i++) { const k = sessionStorage.key(i); ss[k] = (sessionStorage.getItem(k) || "").slice(0, 120); } } catch {}' +
      'return JSON.stringify({ url: location.href, host: location.host, title: document.title, crumbs: crumbs, ls: ls, ss: ss });' +
      '})()',
      ).then((raw: string) => JSON.parse(raw));
    let cookies: WebPageState['cookies'] = [];
    try {
      cookies = (await wc.session.cookies.get({ url: String(page?.url ?? '') }))
        .slice(0, 40)
        .map((cookie) => ({ name: cookie.name, domain: cookie.domain || '', httpOnly: Boolean(cookie.httpOnly) }));
    } catch {
      cookies = [];
    }
    const state: WebPageState = {
      url: String(page?.url ?? ''),
      host: String(page?.host ?? ''),
      title: String(page?.title ?? ''),
      crumbs: Array.isArray(page?.crumbs) ? page.crumbs.map(String) : [],
      cookies,
      local: page?.ls ?? {},
      session: page?.ss ?? {},
    };
    return { ok: true, state };
  } catch (error: any) {
    return { ok: false, error: error?.message || String(error) };
  }
});

  onRecordingStatus((recordingState) => {
    chassis.broadcast('recording:status', recordingState);
  });
}
