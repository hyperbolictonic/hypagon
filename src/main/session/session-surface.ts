/**
 * Session vault surface.
 *
 * Owns the cookie/session snapshots: save, restore, list and delete. The active
 * tab supplies the Electron session; the chassis supplies the directive log and
 * the harvest-shaped telemetry the HUD shows.
 */
import type { WebContents } from 'electron';
import { SessionVault } from './session-vault.js';

/** Dependencies the session surface needs from the active tab and telemetry. */
export interface SessionSurfaceDeps {
  activeWebContents(): WebContents;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  emitHarvest(details: string): void;
}

/** The named cookie/session snapshots behind the session routes. */
export class SessionSurface {
  private readonly vault = new SessionVault();

  constructor(private readonly deps: SessionSurfaceDeps) {}

  async save(name?: string) {
    this.deps.log('action', `MCP Directive: save_session("${name || 'auto'}")`);
    const wc = this.deps.activeWebContents();
    const result = await this.vault.saveSession(wc.session, wc, name);
    this.deps.emitHarvest(`Saved session "${result.name}" with ${result.cookiesCount} cookies`);
    return result;
  }

  async restore(name: string) {
    this.deps.log('action', `MCP Directive: restore_session("${name}")`);
    const wc = this.deps.activeWebContents();
    const result = await this.vault.restoreSession(wc.session, wc, name);
    this.deps.emitHarvest(`Restored session "${result.name}" (${result.cookiesRestored} cookies)`);
    return result;
  }

  list() {
    return this.vault.listSessions();
  }

  remove(name: string) {
    this.deps.log('action', `MCP Directive: delete_session("${name}")`);
    return this.vault.deleteSession(name);
  }
}
