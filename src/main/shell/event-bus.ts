/**
 * Shell event bus.
 *
 * The shell window and the deck panel are the two render surfaces. Everything
 * that reports to the HUD goes through here: shell-only messages, fan-out to
 * both, and the public broadcast the collaboration/recording services use.
 */
import type { BrowserWindow, WebContentsView } from 'electron';

/** Dependencies the bus needs to reach the two render surfaces. */
export interface ShellBusDeps {
  window(): BrowserWindow | null;
  deckView(): WebContentsView | null;
}

/** The render fan-out for the shell window and the deck panel. */
export class ShellBus {
  private readonly deps: ShellBusDeps;

  constructor(deps: ShellBusDeps) {
    this.deps = deps;
  }

  /** Send to the shell window only (the deck panel receives through DeckController). */
  toShell(channel: string, payload: unknown): void {
    const win = this.deps.window();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }

  toSurfaces(channel: string, payload: unknown): void {
    this.toShell(channel, payload);
    const panel = this.deps.deckView()?.webContents;
    if (panel && !panel.isDestroyed()) panel.send(channel, payload);
  }

  /** Broadcast an event to every render surface (shell and deck panel alike). */
  broadcast(channel: string, payload?: unknown): void {
    this.toSurfaces(channel, payload);
  }
}
