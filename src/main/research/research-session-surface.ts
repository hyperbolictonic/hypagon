/**
 * Research session surface.
 *
 * Owns the stealth research session (its own cookie jar, UA headers, proxy), the
 * persisted settings that configure it and the per-host cooldown policy. The
 * crawl/search surfaces read through this one object instead of reaching for the
 * session controller directly.
 */
import type { Session } from 'electron';
import type { HostBrowserProfile } from '../telemetry/host-fingerprint.js';
import type { ResearchSettings } from './settings.js';
import { ResearchSessionController } from './session-controller.js';

/** Dependencies the research session surface needs to boot its isolated session. */
export interface ResearchSessionSurfaceDeps {
  hostProfile: HostBrowserProfile;
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** The settings, isolated session and cooldown policy behind research runs. */
export class ResearchSessionSurface {
  private readonly controller: ResearchSessionController;

  constructor(deps: ResearchSessionSurfaceDeps) {
    this.controller = new ResearchSessionController({
      hostProfile: deps.hostProfile,
      log: deps.log,
    });
  }

  settings(): ResearchSettings {
    return this.controller.getSettings();
  }

  async setSettings(settings: ResearchSettings): Promise<void> {
    await this.controller.setSettings(settings);
  }

  async reset(): Promise<void> {
    await this.controller.reset();
  }

  /** The isolated session the research components load through. */
  session(): Session {
    return this.controller.getSessionForComponents();
  }

  async activateView(wc: { debugger: any }): Promise<void> {
    await this.controller.activateView(wc);
  }

  /** The Settings engine chain and custom template, applied unless the call overrides them. */
  applyEnginePolicy<T extends { engine?: string; engines?: string[]; urlTemplate?: string }>(effective: T): void {
    this.controller.applyEnginePolicy(effective);
  }

  isCooling(host: string): boolean {
    return this.controller.isCooling(host);
  }

  markCooldown(host: string, reason: string): void {
    this.controller.markCooldown(host, reason);
  }

  /** Refuse a crawl/render of a host that is cooling down. */
  assertNotCooling(url: string): void {
    this.controller.assertNotCooling(url);
  }
}
