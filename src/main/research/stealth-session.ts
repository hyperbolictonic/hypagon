/**
 * The stealth research session: its own partition, cookie jar, UA headers and proxy, plus the
 * one-time carry-over from the pre-rename partition and the CDP activation a research read needs.
 *
 * Why a module: configuring the session (UA, proxy, stealth headers) and waking a backgrounded
 * view are two mechanisms over the same partition, and neither is about settings or cooldowns.
 */
import type { Session } from 'electron';
import { session as electronSession } from 'electron';
import { applyStealthHeaders } from '../browser/stealth.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import type { ResearchSettings } from './settings.js';

/** When to use: `new ResearchSessionController` — the profile the session must present. */
export interface StealthSessionDeps {
  hostProfile: HostBrowserProfile;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** When to use: `ResearchSessionController.stealth` — one per controller. */
export class StealthSession {
  private readonly deps: StealthSessionDeps;
  private configured = false;
  private migrated = false;

  constructor(deps: StealthSessionDeps) {
    this.deps = deps;
  }

  /** The research partition (a legacy name; the app is branded Hypagon now). */
  get(): Session {
    return electronSession.fromPartition('persist:hypagon-research');
  }

  /** Apply the UA, the proxy and (once) the stealth header set. */
  async configure(settings: ResearchSettings): Promise<void> {
    await this.migrate();
    const researchSession = this.get();
    try {
      researchSession.setUserAgent(this.deps.hostProfile.userAgent);
    } catch {
      /* profile optional */
    }

    try {
      await researchSession.setProxy(settings.proxyUrl ? { proxyRules: settings.proxyUrl } : { mode: 'direct' });
    } catch (err: any) {
      this.deps.log('warn', `Research proxy could not be applied: ${err?.message || err}`);
    }

    if (!this.configured) {
      this.configured = true;
      // The research session keeps its header set (no mobile hint, no UA override).
      applyStealthHeaders(researchSession, this.deps.hostProfile, { mobile: false });
    }
  }

  /** Clear the jar and the cache (Settings → Research → reset). */
  async clear(): Promise<void> {
    const researchSession = this.get();
    await researchSession.clearStorageData().catch(() => undefined);
    await researchSession.clearCache().catch(() => undefined);
  }

  /**
   * Wake the research view through CDP: backgrounded pages throttle timers and can render
   * differently. Called before the first read from a research tab.
   */
  async activate(settings: ResearchSettings, wc: { debugger: any }): Promise<void> {
    if (!settings.enabled || !settings.activateView) return;
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

  /** One-time cookie carry-over from the pre-rename research partition. */
  private async migrate(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;
    try {
      const current = this.get();
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
}
