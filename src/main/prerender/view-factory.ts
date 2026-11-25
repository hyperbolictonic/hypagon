/**
 * Spawning one background prerender view.
 *
 * Why a module: creating the `WebContentsView`, applying the host fingerprint's
 * stealth headers, denying popups and waiting for hydration (with an 8 s safety
 * timeout) is the same sequence for every candidate URL. The engine only decides
 * which URLs to warm.
 */
import { WebContentsView } from 'electron';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import { applyHostProfile } from '../browser/stealth.js';
import type { PrerenderItem } from './types.js';

/**
 * When to use: `PrerenderEngine.prerender` — one warm view for `targetUrl`,
 * resolved as soon as the document is ready (plus the requested settle delay).
 */
export function spawnPrerenderView(
  hostProfile: HostBrowserProfile,
  targetUrl: string,
  waitIdleMs: number,
): Promise<PrerenderItem> {
  const view = new WebContentsView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: true,
    },
  });

  const wc = view.webContents;
  // Apply the host profile: UA plus the client hints that go with it.
  applyHostProfile(wc, hostProfile);

  // Suppress popups from prerendered views
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));

  const item: PrerenderItem = {
    url: targetUrl,
    view,
    createdAt: Date.now(),
    ready: false,
    title: 'Prerendering...',
    harvested: false,
  };

  return new Promise((resolve) => {
    const finish = async () => {
      item.title = wc.getTitle() || targetUrl;
      item.ready = true;
      if (waitIdleMs > 0) {
        await new Promise((r) => setTimeout(r, waitIdleMs));
      }
      resolve(item);
    };

    const timer = setTimeout(finish, 8000); // 8s safety timeout

    wc.once('did-finish-load', () => {
      clearTimeout(timer);
      finish();
    });

    wc.once('did-fail-load', () => {
      clearTimeout(timer);
      resolve(item);
    });

    wc.loadURL(targetUrl).catch(() => {
      clearTimeout(timer);
      resolve(item);
    });
  });
}
