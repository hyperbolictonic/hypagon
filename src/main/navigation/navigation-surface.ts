/**
 * Active-tab navigation surface.
 *
 * Owns navigate-to, the shared history step and reload. The chassis supplies
 * the active tab, the speculative prerender pool, the JEV purge, the Shadow
 * Walk patch and the consent sweep, so the controller stays a coordinator of
 * explicit deps rather than a second chassis.
 */
import type { WebContents, WebContentsView } from 'electron';
import { classifyNavigationFailure } from '../navigation-error.js';

type NavigationDirection = 'back' | 'forward';

/** Dependencies the navigation surface needs from the active tab and chassis state. */
export interface NavigationSurfaceDeps {
  activeWebContents(): WebContents;
  welcomePagePath(): string | undefined;
  createTab(url: string, view: WebContentsView): void;
  prerender: {
    normalizeUrl(url: string): string;
    has(url: string): boolean;
    consume(url: string): WebContentsView | undefined;
  };
  beginTraversal(): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  bumpNav(): void;
  purgeJev(): void;
  syncForceOpen(wc: WebContents): Promise<unknown>;
  scheduleConsentSweep(): void;
  bumpRevision(): void;
  broadcastState(): void;
}

/** The active-tab navigate/history/reload surface. */
export class NavigationSurface {
  constructor(private readonly deps: NavigationSurfaceDeps) {}

  async navigateTo(url: string, autoDismissConsent: boolean = true): Promise<string> {
    this.deps.bumpNav();
    this.deps.purgeJev();
    const wc = this.deps.activeWebContents();
    await this.deps.syncForceOpen(wc);
    this.deps.beginTraversal();

    if (url === 'about:blank' || url === 'mark-eleven://manual' || url === 'mark-eleven://welcome') {
      const manualPath = this.deps.welcomePagePath();
      if (manualPath) {
        this.deps.log('action', 'MCP Directive: navigate_to(mark-eleven://manual)');
        await wc.loadFile(manualPath);
        return 'Loaded Hypagon Browser Manual';
      }
    }

    const formattedUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;

    // 0ms Navigation: check if the target URL is already warm in the speculative prerender pool.
    // Guard: do not elevate if the active tab is already on this page/domain or form state is present.
    const currentUrl = wc.getURL();
    const isSamePage = currentUrl
      ? this.deps.prerender.normalizeUrl(currentUrl) === this.deps.prerender.normalizeUrl(formattedUrl)
      : false;

    if (!isSamePage && this.deps.prerender.has(formattedUrl)) {
      const warmView = this.deps.prerender.consume(formattedUrl);
      if (warmView) {
        this.deps.log('action', `0ms Speculative Elevation: Elevated prerendered view for ${formattedUrl}`);
        this.deps.createTab(formattedUrl, warmView);
        return `Navigated to ${formattedUrl} (0ms Speculative Instant Elevation)`;
      }
    }

    this.deps.log('action', `MCP Directive: navigate_to(${formattedUrl})`);
    const navPromise = wc.loadURL(formattedUrl);

    if (autoDismissConsent) {
      // Consent walls frequently mount *after* load — a hydration delay, or after a login/redirect
      // (Reddit's cookie dialog arrives post-signin). Sweep a few settle points; each sweep is gated
      // by a cheap consent-only DOM check, so this never clicks an ordinary dialog.
      this.deps.scheduleConsentSweep();
    }

    try {
      await navPromise;
    } catch (error: any) {
      const failure = classifyNavigationFailure(formattedUrl, error);
      const wrapped = new Error(failure.message) as Error & { code?: string; cause?: string; url?: string };
      wrapped.code = failure.code;
      wrapped.cause = failure.cause;
      wrapped.url = failure.url;
      this.deps.log('warn', failure.message);
      throw wrapped;
    }
    this.deps.bumpRevision();
    return `Navigated to ${formattedUrl}`;
  }

  async goBack(): Promise<string> {
    return this.historyStep('back');
  }

  async goForward(): Promise<string> {
    return this.historyStep('forward');
  }

  /** The shared history step: both directions check, purge the JEV store and report the same messages. */
  private async historyStep(direction: NavigationDirection): Promise<string> {
    const wc = this.deps.activeWebContents();
    await this.deps.syncForceOpen(wc);
    const can = direction === 'back' ? wc.navigationHistory.canGoBack() : wc.navigationHistory.canGoForward();
    if (!can) return `Cannot navigate ${direction}; at ${direction === 'back' ? 'start' : 'end'} of history`;
    this.deps.purgeJev();
    if (direction === 'back') wc.navigationHistory.goBack();
    else wc.navigationHistory.goForward();
    this.deps.bumpRevision();
    this.deps.broadcastState();
    return `Navigated ${direction} in history`;
  }

  async reload(): Promise<string> {
    const wc = this.deps.activeWebContents();
    await this.deps.syncForceOpen(wc);
    this.deps.purgeJev();
    wc.reload();
    this.deps.bumpRevision();
    this.deps.broadcastState();
    return 'Reloaded active web page';
  }
}
