/**
 * Research infrastructure: the stealth research session (own cookie jar,
 * partition, proxy, UA headers), the settings that configure it, and the
 * per-host cooldown that pauses an engine after a WAF/challenge response.
 *
 * Why a module: the chassis carried the research settings object, the legacy
 * partition migration, the session configuration, the cooldown map and the
 * engine-host resolution as separate fields and methods that only made sense
 * together. One controller owns them; the search, crawl and research
 * components receive the session through their configs as before.
 */
import type { Session } from 'electron';
import { session as electronSession } from 'electron';
import { DEFAULT_RESEARCH_SETTINGS, type ResearchSettings } from './settings.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';

/** When to use: declaring the error contract shared by the research surfaces. */
export function researchError(code: string, message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

/** When to use: building the chassis — the collaborators the research session reads through. */
export interface ResearchSessionDeps {
  /** The fingerprint profile the session's requests must present. */
  hostProfile: HostBrowserProfile;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** When to use: the chassis — own the stealth research session, its settings and WAF cooldowns. */
export class ResearchSessionController {
  private readonly deps: ResearchSessionDeps;
  private settings: ResearchSettings = DEFAULT_RESEARCH_SETTINGS;
  private cooldowns = new Map<string, number>();
  private sessionConfigured = false;
  private sessionMigrated = false;

  constructor(deps: ResearchSessionDeps) {
    this.deps = deps;
  }

  getSettings(): ResearchSettings {
    return {
      ...this.settings,
      engineChain: [...this.settings.engineChain],
    };
  }

  async setSettings(settings: ResearchSettings): Promise<void> {
    this.settings = {
      ...settings,
      engineChain: [...settings.engineChain],
    };
    await this.configureSession();
  }

  /** Clear the research jar (Settings → Research → reset). */
  async reset(): Promise<void> {
    const researchSession = this.getSession();
    await researchSession.clearStorageData().catch(() => undefined);
    await researchSession.clearCache().catch(() => undefined);
    this.cooldowns.clear();
    this.deps.log('info', 'Research session cookies/cache cleared.');
  }

  /** Legacy partition name; the app is branded Hypagon now. Cookies are migrated once so existing research logins survive the rename. */
  private getSession(): Session {
    return electronSession.fromPartition('persist:hypagon-research');
  }

  /** When to use: component configs (llm surface, crawler) that need the research partition. */
  getSessionForComponents(): Session {
    return this.getSession();
  }

  /** One-time cookie carry-over from the pre-rename research partition. */
  private async migrateLegacySession(): Promise<void> {
    if (this.sessionMigrated) return;
    this.sessionMigrated = true;
    try {
      const current = this.getSession();
      const existing = await current.cookies.get({});
      if (existing.length > 0) return;

      const legacy = electronSession.fromPartition('persist:kuang-research');
      const legacyCookies = await legacy.cookies.get({});
      for (const cookie of legacyCookies) {
        const host = (cookie.domain || '').replace(/^\./, '');
        if (!host) continue;
        const cookiePath = cookie.path || '/';
        await current.cookies
          .set({
            url: `${cookie.secure ? 'https' : 'http'}://${host}${cookiePath}`,
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookiePath,
            secure: cookie.secure,
            httpOnly: cookie.httpOnly,
            expirationDate: cookie.expirationDate,
            sameSite: cookie.sameSite,
          })
          .catch(() => undefined);
      }
      if (legacyCookies.length > 0) {
        this.deps.log('info', `Migrated ${legacyCookies.length} research cookie(s) to the Hypagon partition.`);
      }
    } catch {
      /* best effort; a fresh research session is acceptable */
    }
  }

  private async configureSession(): Promise<void> {
    await this.migrateLegacySession();
    const researchSession = this.getSession();
    try {
      researchSession.setUserAgent(this.deps.hostProfile.userAgent);
    } catch {
      /* profile optional */
    }

    try {
      await researchSession.setProxy(
        this.settings.proxyUrl ? { proxyRules: this.settings.proxyUrl } : { mode: 'direct' },
      );
    } catch (err: any) {
      this.deps.log('warn', `Research proxy could not be applied: ${err?.message || err}`);
    }

    if (!this.sessionConfigured) {
      this.sessionConfigured = true;
      researchSession.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = this.deps.hostProfile.userAgent;
        details.requestHeaders['sec-ch-ua'] = this.deps.hostProfile.secChUa;
        details.requestHeaders['sec-ch-ua-platform'] = this.deps.hostProfile.secChUaPlatform;
        callback({ requestHeaders: details.requestHeaders });
      });
    }
  }

  /**
   * Wake the research view through CDP: backgrounded pages throttle timers and
   * can render differently. Called before the first read from a research tab.
   */
  async activateView(wc: { debugger: any }): Promise<void> {
    if (!this.settings.enabled || !this.settings.activateView) return;
    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
      await wc.debugger.sendCommand('Page.enable').catch(() => undefined);
      await wc.debugger.sendCommand('Page.setWebLifecycleState', { state: 'active' }).catch(() => undefined);
      await wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => undefined);
      await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      }).catch(() => undefined);
    } catch {
      // The page can still be read without the CDP activation.
    }
  }

  /** The host an engine loads in; the custom engine resolves its template. */
  engineHost(engine: string): string {
    if (engine === 'custom' && this.settings.urlTemplate) {
      try {
        return new URL(this.settings.urlTemplate.replace('{query}', 'test')).hostname;
      } catch {
        return '';
      }
    }
    return (
      {
        google: 'www.google.com',
        duckduckgo: 'html.duckduckgo.com',
        bing: 'www.bing.com',
        brave: 'search.brave.com',
        startpage: 'www.startpage.com',
      } as Record<string, string>
    )[engine] || '';
  }

  isCooling(host: string): boolean {
    if (!host) return false;
    return (this.cooldowns.get(host) || 0) > Date.now();
  }

  markCooldown(host: string, reason: string): void {
    if (!host || !this.settings.enabled) return;
    const until = Date.now() + this.settings.domainCooldownSec * 1000;
    this.cooldowns.set(host, until);
    this.deps.log(
      'warn',
      `Research cooldown: ${host} paused for ${this.settings.domainCooldownSec}s after ${reason}.`,
    );
  }

  /** Refuse a crawl/render of a host that is cooling down. */
  assertNotCooling(url: string): void {
    if (!this.settings.enabled) return;
    try {
      const host = new URL(url).hostname;
      const until = this.cooldowns.get(host) || 0;
      if (until > Date.now()) {
        const seconds = Math.ceil((until - Date.now()) / 1000);
        throw researchError('RESEARCH_COOLDOWN', `${host} is cooling down after a WAF/challenge; try again in ${seconds}s.`);
      }
    } catch (err: any) {
      if (err?.code === 'RESEARCH_COOLDOWN') throw err;
    }
  }

  /** The Settings engine chain and custom template, applied unless the call overrides them. */
  applyEnginePolicy<T extends { engine?: string; engines?: string[]; urlTemplate?: string }>(effective: T): void {
    if (!effective.engine && (!effective.engines || effective.engines.length === 0)) {
      effective.engines = this.settings.urlTemplate
        ? ['custom', ...this.settings.engineChain]
        : [...this.settings.engineChain];
    }
    if (this.settings.urlTemplate && !effective.urlTemplate) {
      effective.urlTemplate = this.settings.urlTemplate;
    }
  }
}
