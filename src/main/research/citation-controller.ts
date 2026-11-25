/**
 * Citations and the human hand-off: anchor capture and revalidation, plus the
 * "a person solves the challenge" path for research pages.
 *
 * Why a module: the anchor store, the warm-origins set (origins a human
 * authenticated in the real browser), the hand-off state and the citation
 * fetch/relocate pipeline were chassis fields and methods that only reasoned
 * about each other. One controller owns them; the chassis and the crawler
 * config keep thin delegations.
 *
 * The hand-off renders research pages in the detached research view (its own
 * cookie jar), attaches it to the window so a human can solve the challenge in
 * the same session, and harvests that live view.
 */
import path from 'node:path';
import { app } from 'electron';
import { anchorHighlights, relocateCitation as relocateAgainstHtml, relocateCitations as relocateMany } from './anchors.js';
import { AnchorStore } from './anchor-store.js';
import { fetchStatic } from '../network/impersonate.js';
import { RenderedSnapshotEngine } from '../snapshots/rendered-snapshot.js';
import type { CitationAnchor, CitationRelocation } from './anchors.js';
import type { HumanAssistInfo } from '../crawl/crawler.js';
import type { ResearchSettings } from './settings.js';
import type { HilManager } from '../hil/hil-manager.js';
import type { BrowserWindow, WebContents } from 'electron';
import { looksLikeChallenge } from './settings.js';
import { researchError } from './session-controller.js';
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

/** When to use: building the chassis — everything the citation pipeline reads through. */
export interface CitationControllerDeps {
  window: () => BrowserWindow | null;
  /** The shared off-screen research view (and its queue). */
  detachedView: DetachedViewController;
  /** The human-in-the-loop manager; the hand-off routes its banner here. */
  hilManager: () => HilManager;
  /** The live research settings (humanInLoop, hilTimeoutSec, preferStatic). */
  researchSettings: () => ResearchSettings;
  /** The browser viewport as actually laid out in the HUD (zoom-aware). */
  viewportBounds: () => Promise<{ x: number; y: number; width: number; height: number }>;
  /** Re-assert native view bounds after the hand-off detaches. */
  reassertViewport: () => void;
  /** The active tab's WebContents, for the banner hand-back after the hand-off. */
  activeWebContents: () => WebContents;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** The outcome of revalidating stored anchors across URLs. */
export interface RevalidationSummary {
  urls: number;
  checked: number;
  found: number;
  missing: number;
  results: Array<{ url: string; checked: number; found: number; error?: string }>;
}

/** When to use: the chassis — own the anchor store, warm origins, hand-off state and the citation fetch/relocate pipeline. */
export class CitationController {
  private readonly deps: CitationControllerDeps;
  #anchorStore: AnchorStore | null = null;
  /** Origins whose consent wall has already been answered (or deliberately left) this session. */
  private warmOrigins = new Set<string>();
  /** Only one human hand-off at a time (the shared research view is serialized). */
  private hilActive = false;
  /** Why the last hand-off was skipped (surfaced in the WAF error). */
  private handoffSkipReason: string | null = null;

  constructor(deps: CitationControllerDeps) {
    this.deps = deps;
  }

  private get anchorStore(): AnchorStore {
    if (!this.#anchorStore) {
      let dir = process.cwd();
      try {
        dir = app.getPath('userData');
      } catch {
        /* fall back to the working directory */
      }
      this.#anchorStore = new AnchorStore(path.join(dir, 'research-anchors.json'));
    }
    return this.#anchorStore;
  }

  /** Why the last hand-off was skipped, for the WAF error message. */
  get skipReason(): string | null {
    return this.handoffSkipReason;
  }

  /** True when a human authenticated this origin in the real browser this session. */
  originIsWarm(url: string): boolean {
    try {
      return this.warmOrigins.has(new URL(url).origin);
    } catch {
      return false;
    }
  }

  /** Record that a human cleared this origin in the real browser. */
  warmOrigin(url: string): void {
    try {
      this.warmOrigins.add(new URL(url).origin);
    } catch {
      /* ignore */
    }
  }

  /** Fingerprint the blocks behind matching highlights and store them for revalidation. */
  async anchorFromHtml(url: string, html: string | undefined | null, anchorsFor: string): Promise<CitationAnchor[] | undefined> {
    if (!html) return undefined;
    const anchors = await anchorHighlights(html, anchorsFor);
    if (anchors.length) this.anchorStore.upsert(url, anchors);
    return anchors;
  }

  /** Fetch a URL for citation work, following the research tier policy. */
  private async fetchCitationHtml(url: string): Promise<{
    html: string;
    status: number;
    via: 'static' | 'render';
    error?: string;
  }> {
    let html = '';
    let status = 0;
    let via: 'static' | 'render' = 'render';

    if (this.deps.researchSettings().preferStatic) {
      try {
        const outcome = await fetchStatic(url);
        if (outcome.kind === 'ok' && outcome.result.status < 400) {
          html = outcome.result.body;
          status = outcome.result.status;
          via = 'static';
        }
      } catch {
        /* fall through to render */
      }
    }

    if (!html) {
      const rendered = await this.deps.detachedView.load<string>(
        url,
        'document.documentElement.outerHTML',
        { timeoutMs: 25_000, settleMs: 400 },
      );
      html = typeof rendered.result === 'string' ? rendered.result : '';
      status = rendered.status;
      via = 'render';
    }

    if (!html) return { html: '', status, via, error: 'could not read the page' };

    // Judge the challenge on visible text: raw HTML contains scripts/meta that can trip a marker.
    const visible = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    if (looksLikeChallenge(status, visible)) {
      return { html: '', status, via, error: 'challenge page' };
    }

    return { html, status, via };
  }

  /** Revalidate a stored citation anchor against the page's current markup. */
  async relocateCitation(opts: {
    url: string;
    fingerprint: unknown;
    threshold?: number;
  }): Promise<CitationRelocation> {
    if (!opts?.url || typeof opts.url !== 'string') {
      throw researchError('BAD_REQUEST', 'relocate_citation needs a url.');
    }
    if (!opts.fingerprint || typeof opts.fingerprint !== 'object') {
      throw researchError('BAD_REQUEST', 'relocate_citation needs a fingerprint object.');
    }

    const fetched = await this.fetchCitationHtml(opts.url);
    if (fetched.error) {
      return {
        found: false,
        score: null,
        path: null,
        text: null,
        candidates: [],
        via: fetched.via,
        error: fetched.error,
      };
    }

    const result = await relocateAgainstHtml(fetched.html, opts.fingerprint as any, opts.threshold ?? 40);
    return { ...result, via: fetched.via };
  }

  /** Revalidate every stored anchor for one URL (or the most recent URLs). */
  async revalidateStored(opts: { url?: string; maxUrls?: number } = {}): Promise<RevalidationSummary> {
    const urls = opts.url
      ? [opts.url]
      // Each URL is fetched sequentially with a 25s limit. Keep a single call bounded so an agent
      // cannot pin the bridge for hours by asking for every stored URL at once.
      : this.anchorStore.urls().slice(0, Math.min(25, Math.max(1, Number(opts.maxUrls) || 5)));

    let checked = 0;
    let found = 0;
    const results: Array<{ url: string; checked: number; found: number; error?: string }> = [];

    for (const url of urls) {
      const records = this.anchorStore.list(url);
      if (records.length === 0) continue;

      const fetched = await this.fetchCitationHtml(url);
      if (fetched.error) {
        results.push({ url, checked: 0, found: 0, error: fetched.error });
        continue;
      }

      const relocations = await relocateMany(
        fetched.html,
        records.map((record) => record.fingerprint),
        40,
      );
      this.anchorStore.applyChecks(url, relocations);

      const urlFound = relocations.filter((result) => result.found).length;
      checked += relocations.length;
      found += urlFound;
      results.push({ url, checked: relocations.length, found: urlFound });
    }

    return { urls: results.length, checked, found, missing: checked - found, results };
  }

  /**
   * Human hand-off for a challenged page. The util view is shared with every
   * detached read; its queue is held for the whole hand-off so a concurrent
   * search/crawl cannot navigate the challenge out from under the human.
   */
  attemptHandoff(
    url: string,
    onHuman?: (info: HumanAssistInfo) => void,
    anchorsFor?: string,
  ): Promise<HumanHandoffResult> {
    return this.deps.detachedView.withView(() => this.attemptHandoffExclusive(url, onHuman, anchorsFor));
  }

  private async attemptHandoffExclusive(
    url: string,
    onHuman?: (info: HumanAssistInfo) => void,
    anchorsFor?: string,
  ): Promise<HumanHandoffResult> {
    const win = this.deps.window();
    if (!win || win.isDestroyed()) return null;
    if (process.env.HYPAGON_HIL === '0') return null;
    if (!this.deps.researchSettings().humanInLoop) return null;
    if (this.hilActive) return null;

    this.handoffSkipReason = null;
    this.hilActive = true;
    const view = this.deps.detachedView.getView();
    const wc = view.webContents;
    let attached = false;
    let humanMs = 0;

    try {
      // A queued detached read can run between the failed render and this hand-off. Reload the
      // challenged URL when the view no longer shows it, so the human never solves another page.
      if (wc.getURL() !== url) {
        try {
          await wc.loadURL(url);
        } catch {
          /* probe whatever committed */
        }
      }

      const probe = await this.probeHumanActionable(wc);
      if (!probe.actionable && process.env.HYPAGON_HIL_FORCE !== '1') {
        this.handoffSkipReason = probe.why;
        this.deps.log('info', `Skipping human hand-off for ${url}: ${probe.why}.`);
        return null;
      }

      win.contentView.addChildView(view);
      attached = true;
      view.setBounds(await this.deps.viewportBounds());
      win.show();
      win.focus();
      // The hand-off page is a WebContentsView, not a tab: give it keyboard focus so F5/Ctrl+R
      // reach it, and route reload explicitly (the app menu reloads the active tab otherwise).
      try {
        wc.focus();
      } catch {
        /* focus is best-effort */
      }
      const onKey = (event: Electron.Event, input: Electron.Input) => {
        const reload =
          input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r');
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
        /* metrics override is optional */
      }

      // Route the intervention banner to the page the human is actually looking at.
      this.deps.hilManager().setActiveWebContentsGetter(() => wc);
      onHuman?.({ phase: 'needed', url, reason: 'challenge' });
      this.deps.log('warn', `Human hand-off requested for ${url}.`);

      // Solving a challenge usually navigates; re-inject the banner so RESUME stays reachable.
      const refresh = () => setTimeout(() => this.deps.hilManager().banner.refresh(), 400);
      wc.on('did-navigate', refresh);
      wc.on('did-finish-load', refresh);

      try {
        const humanStarted = Date.now();
        const resolution = await this.deps.hilManager().requestIntervention({
          reason:
            'A bot challenge or login wall blocked this page. Complete it here, then press RESUME AGENT.',
          url,
          timeoutSeconds: this.deps.researchSettings().hilTimeoutSec,
          bringToFront: true,
          inPageBanner: false,
        });
        humanMs = Date.now() - humanStarted;
        if (resolution.status !== 'resolved') return null;
      } finally {
        wc.removeListener('before-input-event', onKey);
        wc.removeListener('did-navigate', refresh);
        wc.removeListener('did-finish-load', refresh);
      }

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

      const snapshot = await RenderedSnapshotEngine.capture(wc, {
        format: 'markdown',
        waitUntilIdleMs: 400,
      });

      // Anchors are read from the live view here, before the queue is released, so they always
      // describe the document the human actually cleared.
      let anchors: CitationAnchor[] | undefined;
      if (anchorsFor) {
        try {
          const html = await wc.executeJavaScript('document.documentElement.outerHTML');
          if (typeof html === 'string' && html) {
            anchors = await this.anchorFromHtml(url, html, anchorsFor);
          }
        } catch (err: any) {
          this.deps.log('warn', `Citation anchoring failed after hand-off: ${err?.message || err}`);
        }
      }

      this.warmOrigin(url);
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
    } catch (err: any) {
      this.deps.log('warn', `Human hand-off failed for ${url}: ${err?.message || err}`);
      return null;
    } finally {
      this.hilActive = false;
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
          /* already detached */
        }
      }
      this.deps.reassertViewport();
    }
  }

  /**
   * Can a human actually do anything on this page?
   *
   * A bare 403 ("Access Denied", "Request blocked") has no control to interact with; showing it
   * only interrupts the run. A real challenge has a CAPTCHA widget, a credential/OTP field, a form,
   * or an explicit verify/continue control.
   */
  private async probeHumanActionable(
    wc: WebContents,
  ): Promise<{ actionable: boolean; why: string }> {
    const script = `(() => {
      const visible = (el) => {
        try {
          const r = el.getBoundingClientRect();
          if (r.width < 4 || r.height < 4) return false;
          const s = getComputedStyle(el);
          return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
        } catch (e) { return false; }
      };
      const anyVisible = (sel) => {
        try {
          for (const el of document.querySelectorAll(sel)) if (visible(el)) return true;
        } catch (e) {}
        return false;
      };

      const captcha = [
        'iframe[src*="challenges.cloudflare.com"]',
        'iframe[src*="hcaptcha.com"]',
        'iframe[src*="recaptcha"]',
        'iframe[src*="captcha"]',
        '.cf-turnstile', '.h-captcha', '.g-recaptcha', '[data-sitekey]',
      ].find(anyVisible);

      const credential = [
        'input[type="password"]',
        'input[autocomplete="one-time-code"]',
        'input[name*="otp" i]',
        'input[name*="code" i]',
        'input[type="email"]',
      ].find(anyVisible);

      const form = anyVisible('form') && anyVisible('form button, form input[type="submit"]');
      const control = anyVisible('button, [role="button"], input[type="submit"], input[type="checkbox"], input[type="radio"]');
      const text = (document.body ? document.body.innerText : '').toLowerCase();
      const verify = /verify|human|robot|check|continue|login|sign in|unusual traffic|challenge/.test(text);
      const hardBlock =
        /access denied|request blocked|you have been blocked|forbidden|banned|not allowed|ip has been/.test(text) &&
        !captcha && !credential && !form;

      if (captcha) return { actionable: true, why: 'captcha widget' };
      if (credential) return { actionable: true, why: 'credential/OTP field' };
      if (form) return { actionable: true, why: 'form' };
      if (hardBlock) return { actionable: false, why: 'hard block with no controls' };
      if (control && verify) return { actionable: true, why: 'interactive control' };
      return { actionable: false, why: 'no interactive element' };
    })()`;

    try {
      const result = await wc.executeJavaScript(script);
      if (result && typeof result.actionable === 'boolean' && typeof result.why === 'string') {
        return result;
      }
    } catch {
      /* page not scriptable yet */
    }
    return { actionable: true, why: 'probe unavailable' };
  }
}
