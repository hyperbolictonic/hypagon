/**
 * Surface adapters for the host contract.
 *
 * A few surfaces take narrow deps interfaces of their own rather than the whole
 * host (so they stay independent of the composition root). These factories are
 * the one place that maps `ChassisHost` onto those interfaces, keeping the
 * chassis constructor free of wiring literals without creating an import cycle.
 */
import type { ChassisHost } from './host.js';
import { PageScriptSurface } from '../browser/page-script-surface.js';
import { ResearchViewSurface } from '../research/research-view-surface.js';
import { ShadowWalkSurface } from '../shadow-walk/shadow-surface.js';

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: the chassis constructor — the page-script surface over the host's tab. */
export function createPageScriptSurface(host: ChassisHost): PageScriptSurface {
  return new PageScriptSurface({
    activeWebContents: () => host.getActiveWebContents(),
    log: host.log,
  });
}

/** When to use: the chassis constructor — Shadow Walk policy and frame reads over the host's tabs. */
export function createShadowWalkSurface(host: ChassisHost): ShadowWalkSurface {
  return new ShadowWalkSurface({
    activeWebContents: () => host.getActiveWebContents(),
    allTabs: () => host.tabSetup.manager?.allTabs() ?? [],
    log: host.log,
    pressKey: (wc, key) => host.input.simulator.pressKey(wc, key),
    bumpRevision: () => host.bumpRevision(),
    capturePage: (wc, bounds) => host.harvest.capturePageWithRetry(wc, bounds),
  });
}

/** When to use: the chassis constructor — the detached research view plus citations/hand-off. */
export function createResearchViewSurface(host: ChassisHost): ResearchViewSurface {
  return new ResearchViewSurface({
    userAgent: host.hostProfile.userAgent,
    activate: (wc) => host.research.activateView(wc),
    window: () => host.getMainWindow(),
    hilManager: () => host.hil.manager,
    researchSettings: () => host.research.settings(),
    viewportBounds: () => viewportBoundsOf(host),
    reassertViewport: () => host.reassertViewport(),
    activeWebContents: () => host.getActiveWebContents(),
    log: host.log,
  });
}

/**
 * Bounds of the page viewport as actually laid out in the HUD (zoom-aware).
 *
 * The layout bounds come from the shell's `#viewport-container`; a missing or
 * destroyed window falls back to the computed tab bounds.
 */
async function viewportBoundsOf(host: ChassisHost): Promise<Bounds> {
  const win = host.getMainWindow();
  if (!win || win.isDestroyed()) return host.tabSetup.bounds();
  try {
    const rect = await win.webContents.executeJavaScript(
      `(() => {
        const el = document.getElementById('viewport-container');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })()`,
    );
    if (rect && rect.width > 0 && rect.height > 0) {
      const zoom = win.webContents.getZoomFactor() || 1;
      return {
        x: Math.round(rect.x * zoom),
        y: Math.round(rect.y * zoom),
        width: Math.round(rect.width * zoom),
        height: Math.round(rect.height * zoom),
      };
    }
  } catch {
    /* fall back to the static calculation */
  }
  return host.tabSetup.bounds();
}
