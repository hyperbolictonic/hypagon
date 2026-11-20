/**
 * Session snapshots as a collaborator.
 *
 * Cookie save/restore/list/delete used to be four `BrowserChassis` methods; they are a thin,
 * self-contained surface over `SessionVault`, so they live in their own class and the chassis
 * exposes one field (`chassis.sessions`).
 */
import type { WebContents } from 'electron';
import type { SessionVault } from '../session/session-vault.js';
import type { TelemetryEvent } from '../../shared/types.js';

/** When to use: constructing the session surface from the chassis' own services. */
export interface SessionSurfaceDeps {
  vault: SessionVault;
  webContents: () => WebContents;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  telemetry: (event: TelemetryEvent) => void;
}

/** When to use: `chassis.sessions` — the session save/restore surface. */
export class SessionSurface {
  constructor(private readonly deps: SessionSurfaceDeps) {}

  /** When to use: `save_session` — snapshot the active tab's cookies and storage. */
  async save(name?: string): ReturnType<SessionVault['saveSession']> {
    this.deps.log('action', `MCP Directive: save_session("${name || 'auto'}")`);
    const wc = this.deps.webContents();
    const result = await this.deps.vault.saveSession(wc.session, wc, name);
    this.deps.telemetry({
      type: 'harvest',
      timestamp: Date.now(),
      details: `Saved session "${result.name}" with ${result.cookiesCount} cookies`,
    });
    return result;
  }

  /** When to use: `restore_session` — reapply a saved snapshot. */
  async restore(name: string): ReturnType<SessionVault['restoreSession']> {
    this.deps.log('action', `MCP Directive: restore_session("${name}")`);
    const wc = this.deps.webContents();
    const result = await this.deps.vault.restoreSession(wc.session, wc, name);
    this.deps.telemetry({
      type: 'harvest',
      timestamp: Date.now(),
      details: `Restored session "${result.name}" (${result.cookiesRestored} cookies)`,
    });
    return result;
  }

  /** When to use: `list_sessions` — the saved snapshots. */
  list(): ReturnType<SessionVault['listSessions']> {
    return this.deps.vault.listSessions();
  }

  /** When to use: `delete_session` — drop a saved snapshot. */
  delete(name: string): boolean {
    this.deps.log('action', `MCP Directive: delete_session("${name}")`);
    return this.deps.vault.deleteSession(name);
  }
}
