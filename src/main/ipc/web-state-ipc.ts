/**
 * The `chassis:web-state` IPC surface.
 *
 * Why a module: the Command Deck WEB STATE tab needs a breadcrumb, the cookies
 * and both storage snapshots, which means one in-page script plus a cookie
 * lookup. That is page logic, not entry-point logic.
 */
import { ipcMain } from 'electron';
import type { BrowserChassis } from '../browser-chassis.js';
import { activeWebContents } from '../chassis/accessors.js';
import type { WebPageState } from '../../shared/web-state.js';

/** When to use: once at startup — the handler reads the active tab on demand. */
export function registerWebStateIpc(chassis: BrowserChassis): void {
  ipcMain.handle('chassis:web-state', async () => {
    try {
      const wc = activeWebContents(chassis);
      const page = await wc
        .executeJavaScript(
          '(() => { ' +
            'const crumbs = (location.pathname || "").split("/").filter(Boolean);' +
            'const ls = {}; const ss = {};' +
            'try { for (let i = 0; i < localStorage.length && i < 50; i++) { const k = localStorage.key(i); ls[k] = (localStorage.getItem(k) || "").slice(0, 120); } } catch {}' +
            'try { for (let i = 0; i < sessionStorage.length && i < 50; i++) { const k = sessionStorage.key(i); ss[k] = (sessionStorage.getItem(k) || "").slice(0, 120); } } catch {}' +
            'return JSON.stringify({ url: location.href, host: location.host, title: document.title, crumbs: crumbs, ls: ls, ss: ss });' +
            '})()',
        )
        .then((raw: string) => JSON.parse(raw));
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
}
