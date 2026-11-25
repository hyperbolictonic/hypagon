/**
 * The per-host cooldown: after a WAF or challenge page, pause that host for the configured
 * number of seconds instead of hammering it.
 *
 * Why a module: the map, the deadline arithmetic and the refusal message are one policy, and the
 * crawl and search surfaces only ever ask "is this host cooling?" or "may I load it?".
 */
import type { ResearchSettings } from './settings.js';
import { researchError } from './errors.js';

/** When to use: `new ResearchSessionController` — the settings to honour and the log. */
export interface CooldownDeps {
  /** Read at call time: the setting can change between runs. */
  settings: () => ResearchSettings;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Injected clock (ms) for tests. */
  now?: () => number;
}

/** When to use: `ResearchSessionController.cooldowns` — one per controller. */
export class Cooldowns {
  private readonly deps: CooldownDeps;
  private readonly until = new Map<string, number>();

  constructor(deps: CooldownDeps) {
    this.deps = deps;
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  /** True while the host is paused (unknown hosts are never cooling). */
  isCooling(host: string): boolean {
    if (!host) return false;
    return (this.until.get(host) || 0) > this.now();
  }

  /** Pause a host after a WAF/challenge response; a no-op while research is disabled. */
  mark(host: string, reason: string): void {
    const settings = this.deps.settings();
    if (!host || !settings.enabled) return;
    this.until.set(host, this.now() + settings.domainCooldownSec * 1000);
    this.deps.log('warn', `Research cooldown: ${host} paused for ${settings.domainCooldownSec}s after ${reason}.`);
  }

  /** Refuse a crawl/render of a host that is cooling down. */
  assert(url: string): void {
    if (!this.deps.settings().enabled) return;
    try {
      const host = new URL(url).hostname;
      const until = this.until.get(host) || 0;
      if (until > this.now()) {
        const seconds = Math.ceil((until - this.now()) / 1000);
        throw researchError('RESEARCH_COOLDOWN', `${host} is cooling down after a WAF/challenge; try again in ${seconds}s.`);
      }
    } catch (err: any) {
      if (err?.code === 'RESEARCH_COOLDOWN') throw err;
    }
  }

  /** Forget every deadline (Settings → Research → reset). */
  clear(): void {
    this.until.clear();
  }
}
