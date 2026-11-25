/**
 * How a hand-off reaches the human: the desktop notification, the window summon
 * and the HUD broadcasts.
 *
 * Why a module: the manager's job is the request lifecycle. Raising a native
 * notification, flashing the taskbar and fanning a channel out to the shell are
 * delivery mechanics, and they all need the window.
 */
import { Notification, type BrowserWindow } from 'electron';
import { brandIcon } from '../brand-icon.js';
import { BRAND } from '../../shared/brand.js';
import type { NotificationOptions } from './hil-types.js';

/** When to use: constructing the manager — the window and the broadcast fan-out. */
export interface HilNotifierDeps {
  window: () => BrowserWindow | null;
  broadcastAll?: (channel: string, payload?: unknown) => void;
}

/** When to use: `HilManager` — deliver a hand-off to the desktop and the HUD. */
export class HilNotifier {
  private readonly deps: HilNotifierDeps;

  constructor(deps: HilNotifierDeps) {
    this.deps = deps;
  }

  /** Dispatches a native desktop OS notification. */
  notify(options: NotificationOptions): boolean {
    try {
      if (Notification.isSupported()) {
        const notif = new Notification({
          title: options.title || BRAND.product,
          body: options.message,
          icon: brandIcon(64),
          urgency: options.urgency || 'normal',
          silent: options.sound === false,
        });

        notif.on('click', () => {
          this.summon();
        });

        notif.show();
        return true;
      }
    } catch {
      // Fallback
    }
    return false;
  }

  /** Summons and focuses the main cyberdeck window, flashing the taskbar. */
  summon(): void {
    const win = this.deps.window();
    if (!win || win.isDestroyed()) return;

    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
    win.flashFrame(true);
  }

  /** Sends to the HUD renderer (when it is alive) and fans out to every surface. */
  send(channel: string, payload: unknown): void {
    const win = this.deps.window();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
    this.deps.broadcastAll?.(channel, payload);
  }

  /** Stops the taskbar flash and tells every surface the hand-off is over. */
  clear(): void {
    const win = this.deps.window();
    if (win && !win.isDestroyed()) {
      win.flashFrame(false);
      win.webContents.send('hil:cleared');
    }
    this.deps.broadcastAll?.('hil:cleared');
  }
}
