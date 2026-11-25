/**
 * Research infrastructure: the stealth research session, the settings that configure it, and the
 * per-host cooldown that pauses an engine after a WAF/challenge response.
 *
 * Why this file is small: `stealth-session.ts` owns the partition, the UA/proxy/header
 * configuration, the legacy cookie carry-over and the CDP activation; `cooldowns.ts` owns the
 * deadline map and its refusal; `errors.ts` owns the shared error contract. This class keeps the
 * persisted settings and exposes the policy the crawl and search surfaces call.
 */
import type { Session } from 'electron';
import { DEFAULT_RESEARCH_SETTINGS, type ResearchSettings } from './settings.js';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import { Cooldowns } from './cooldowns.js';
import { StealthSession } from './stealth-session.js';

/** When to use: building the chassis — the collaborators the research session reads through. */
export interface ResearchSessionDeps {
  /** The fingerprint profile the session's requests must present. */
  hostProfile: HostBrowserProfile;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Injected clock (ms) for cooldown tests. */
  now?: () => number;
}

/** When to use: the chassis — own the stealth research session, its settings and WAF cooldowns. */
export class ResearchSessionController {
  private readonly deps: ResearchSessionDeps;
  private settings: ResearchSettings = DEFAULT_RESEARCH_SETTINGS;

  /** The partition, its configuration and the CDP activation. */
  readonly stealth: StealthSession;
  /** The per-host WAF cooldown. */
  readonly cooldowns: Cooldowns;

  constructor(deps: ResearchSessionDeps) {
    this.deps = deps;
    this.stealth = new StealthSession({ hostProfile: deps.hostProfile, log: deps.log });
    this.cooldowns = new Cooldowns({
      settings: () => this.settings,
      log: deps.log,
      now: deps.now,
    });
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
    await this.stealth.configure(this.settings);
  }

  /** Clear the research jar (Settings → Research → reset). */
  async reset(): Promise<void> {
    await this.stealth.clear();
    this.cooldowns.clear();
    this.deps.log('info', 'Research session cookies/cache cleared.');
  }

  /** When to use: component configs (llm surface, crawler) that need the research partition. */
  getSessionForComponents(): Session {
    return this.stealth.get();
  }

  /** Wake a research view before its first read. */
  async activateView(wc: { debugger: any }): Promise<void> {
    await this.stealth.activate(this.settings, wc);
  }

  isCooling(host: string): boolean {
    return this.cooldowns.isCooling(host);
  }

  markCooldown(host: string, reason: string): void {
    this.cooldowns.mark(host, reason);
  }

  /** Refuse a crawl/render of a host that is cooling down. */
  assertNotCooling(url: string): void {
    this.cooldowns.assert(url);
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
