/**
 * The human hand-off for a challenged research page: attach the detached research
 * view to the window, let the human solve the challenge in that session, then
 * harvest what they cleared.
 *
 * Why a module: it was one 164-line method mixing the guard ladder, the view
 * attach/detach, the banner routing, the HIL wait and the harvest. Each of those is
 * now a step, and the shared view's queue is held for the whole hand-off so a
 * concurrent search or crawl cannot navigate the challenge away.
 */
import type { BrowserWindow, WebContents, WebContentsView } from 'electron';
import { RenderedSnapshotEngine } from '../snapshots/rendered-snapshot.js';
import { looksLikeChallenge, type ResearchSettings } from './settings.js';
import { ACTIONABLE_PROBE } from './handoff-probe.js';
import type { CitationAnchor } from './anchors.js';
import type { HumanAssistInfo } from '../crawl/crawler.js';
import type { HilManager } from '../hil/hil-manager.js';
import type { DetachedViewController } from './detached-view.js';

/** The result of a human-handoff read, or null when no human took over. */
export type HumanHandoffResult = {
  title: string;
  markdown: string;
  links: string[];
  status: number;
  humanAssisted?: boolean;
  humanMs?: number;
  anchors?: CitationAnchor[];
} | null;

/** When to use: anything that needs the window, the research view and the HIL. */
export interface HandoffEnvironment {
  window: () => BrowserWindow | null;
  detachedView: DetachedViewController;
  hilManager: () => HilManager;
  researchSettings: () => ResearchSettings;
  viewportBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
  reassertViewport: () => void;
  activeWebContents: () => WebContents;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** When to use: `CitationController` — the hand-off's environment plus the anchors. */
export interface HumanHandoffDeps extends HandoffEnvironment {
  /** Fingerprint the cleared page and store the anchors. */
  anchorFromHtml: (url: string, html: string, anchorsFor: string) => Promise<CitationAnchor[] | undefined>;
  /** Record that the human cleared this origin. */
  warmOrigin: (url: string) => void;
}

/** When to use: `CitationController` — one hand-off at a time per controller. */
export class HumanHandoff {
  private readonly deps: HumanHandoffDeps;
  /** Only one human hand-off at a time (the shared research view is serialized). */
  private active = false;
  /** Why the last hand-off was skipped (surfaced in the WAF error). */
  private reason: string | null = null;

  constructor(deps: HumanHandoffDeps) {
    this.deps = deps;
  }

  /** Why the last hand-off was skipped, for the WAF error message. */
  get skipReason(): string | null {
    return this.reason;
  }

  /** Attempt a hand-off; the detached view's queue is held for its whole duration. */
  attempt(url: string, onHuman?: (info: HumanAssistInfo) => void, anchorsFor?: string): Promise<HumanHandoffResult> {
    return this.deps.detachedView.withView(() => this.run(url, onHuman, anchorsFor));
  }

  /** The guard ladder, then attach → wait for the human → harvest → detach. */
  private async run(url: string, onHuman?: (info: HumanAssistInfo) => void, anchorsFor?: string): Promise<HumanHandoffResult> {
    const win = this.deps.window();
    if (!win || win.isDestroyed()) return null;
    if (process.env.HYPAGON_HIL === '0') return null;
    if (!this.deps.researchSettings().humanInLoop) return null;
    if (this.active) return null;

    this.reason = null;
    this.active = true;
    const view = this.deps.detachedView.getView();
    const wc = view.webContents;
    let attached = false;
    let humanMs = 0;

    try {
      if (!(await this.attachable(wc, url))) return null;

      const detachKeys = await this.attach(win, view, wc);
      attached = true;
      onHuman?.({ phase: 'needed', url, reason: 'challenge' });
      this.deps.log('warn', `Human hand-off requested for ${url}.`);

      try {
        const resolution = await this.awaitHuman(wc, url);
        humanMs = resolution.humanMs;
        if (!resolution.resolved) return null;
      } finally {
        detachKeys();
      }

      return await this.harvest(wc, url, anchorsFor, humanMs, onHuman);
    } catch (err: any) {
      this.deps.log('warn', `Human hand-off failed for ${url}: ${err?.message || err}`);
      return null;
    } finally {
      this.active = false;
      this.deps.hilManager().setActiveWebContentsGetter(() => {
        try {
          return this.deps.activeWebContents();
        } catch {
          return null;
        }
      });
      if (attached && !win.isDestroyed()) {
        try {
          win.contentView.removeChildView(view);
        } catch {
          // Already detached.
        }
      }
      this.deps.reassertViewport();
    }
  }

  /**
   * A queued detached read can run between the failed render and this hand-off. Reload the
   * challenged URL when the view no longer shows it, so the human never solves another page.
   * Returns false (and records why) when there is nothing a human could do.
   */
  private async attachable(wc: WebContents, url: string): Promise<boolean> {
    if (wc.getURL() !== url) {
      try {
        await wc.loadURL(url);
      } catch {
        // Probe whatever committed.
      }
    }

    let probe: { actionable: boolean; why: string } = { actionable: true, why: 'probe unavailable' };
    try {
      const result = await wc.executeJavaScript(ACTIONABLE_PROBE);
      if (result && typeof result.actionable === 'boolean' && typeof result.why === 'string') probe = result;
    } catch {
      // Page not scriptable yet; treat it as actionable so the human still gets a look.
    }
    if (probe.actionable || process.env.HYPAGON_HIL_FORCE === '1') return true;
    this.reason = probe.why;
    this.deps.log('info', `Skipping human hand-off for ${url}: ${probe.why}.`);
    return false;
  }

  /** Put the research view on screen as a real keyboard-reachable page. */
  private async attach(win: BrowserWindow, view: WebContentsView, wc: WebContents): Promise<() => void> {
    win.contentView.addChildView(view);
    view.setBounds(await this.deps.viewportBounds());
    win.show();
    win.focus();
    // The hand-off page is a WebContentsView, not a tab: give it keyboard focus so F5/Ctrl+R
    // reach it, and route reload explicitly (the app menu reloads the active tab otherwise).
    try {
      wc.focus();
    } catch {
      // Focus is best-effort.
    }
    const onKey = (event: Electron.Event, input: Electron.Input) => {
      const reload = input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r');
      if (reload) {
        event.preventDefault();
        wc.reload();
      }
    };
    wc.on('before-input-event', onKey);

    // Off-screen research renders force a 1280x900 metrics override. For a human to solve a
    // challenge the page should lay out at the real viewport, not a fake capture size.
    try {
      if (wc.debugger.isAttached()) {
        await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
        await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
      }
    } catch {
      // Metrics override is optional.
    }

    return () => wc.removeListener('before-input-event', onKey);
  }

  /** Wait for the human (or the timeout) and report how long they took. */
  private async awaitHuman(wc: WebContents, url: string): Promise<{ resolved: boolean; humanMs: number }> {
    // Route the intervention banner to the page the human is looking at; solving a challenge
    // usually navigates, so re-inject it to keep RESUME reachable.
    this.deps.hilManager().setActiveWebContentsGetter(() => wc);
    const refresh = () => setTimeout(() => this.deps.hilManager().banner.refresh(), 400);
    wc.on('did-navigate', refresh);
    wc.on('did-finish-load', refresh);
    try {
      const started = Date.now();
      const resolution = await this.deps.hilManager().requestIntervention({
        reason: 'A bot challenge or login wall blocked this page. Complete it here, then press RESUME AGENT.',
        url,
        timeoutSeconds: this.deps.researchSettings().hilTimeoutSec,
        bringToFront: true,
        inPageBanner: false,
      });
      return { resolved: resolution.status === 'resolved', humanMs: Date.now() - started };
    } finally {
      wc.removeListener('did-navigate', refresh);
      wc.removeListener('did-finish-load', refresh);
    }
  }

  /** Harvest what the human cleared: title, text, links, markdown and (optionally) anchors. */
  private async harvest(
    wc: WebContents,
    url: string,
    anchorsFor: string | undefined,
    humanMs: number,
    onHuman?: (info: HumanAssistInfo) => void,
  ): Promise<HumanHandoffResult> {
    const state = await wc
      .executeJavaScript(
        `(() => ({
            title: document.title || '',
            text: (document.body ? document.body.innerText : '').slice(0, 4000),
            links: Array.from(document.querySelectorAll('a[href]'))
              .map((a) => a.href)
              .filter((h) => /^https?:/i.test(h))
              .slice(0, 400),
          }))()`,
      )
      .catch(() => null);
    if (!state) return null;

    // A login may be resolved while the WAF is still up — don't pretend it worked.
    if (looksLikeChallenge(200, state.text || '')) return null;

    const snapshot = await RenderedSnapshotEngine.capture(wc, { format: 'markdown', waitUntilIdleMs: 400 });

    // Anchors are read from the live view here, before the queue is released, so they always
    // describe the document the human actually cleared.
    let anchors: CitationAnchor[] | undefined;
    if (anchorsFor) {
      try {
        const html = await wc.executeJavaScript('document.documentElement.outerHTML');
        if (typeof html === 'string' && html) anchors = await this.deps.anchorFromHtml(url, html, anchorsFor);
      } catch (err: any) {
        this.deps.log('warn', `Citation anchoring failed after hand-off: ${err?.message || err}`);
      }
    }

    this.deps.warmOrigin(url);
    onHuman?.({ phase: 'done', url });
    this.deps.log('action', `Human hand-off cleared the challenge for ${url}.`);

    return {
      title: state.title || url,
      markdown: snapshot.content || '',
      links: Array.isArray(state.links) ? state.links : [],
      status: 200,
      humanAssisted: true,
      humanMs,
      anchors,
    };
  }
}
