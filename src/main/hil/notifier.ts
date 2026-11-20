/**
 * Desktop notification delivery for hand-offs.
 *
 * One place owns the OS toast and the two window gestures around it: focus the deck
 * when the human clicks the toast, or surface it without stealing focus when the agent
 * asks for help. Windows gets raw toast XML so a critical hand-off stays on screen
 * longer than the default slot.
 *
 * When to use: raising a hand-off alert or the generic notify route. The hand-off
 * lifecycle (request, resolve, cancel, timeout) lives in hil-manager.ts.
 */

import { Notification, app, nativeImage, type BrowserWindow } from 'electron';
import { pathToFileURL } from 'node:url';
import { BRAND } from '../../shared/brand.js';
import { brandIconPath } from '../ui/brand-icon.js';

/** When to use: sending a desktop toast (title, message, urgency, sound). */
export interface NotificationOptions {
  title: string;
  message: string;
  urgency?: 'normal' | 'critical' | 'low';
  sound?: boolean;
}

/**
 * When to use: constructing the notifier with a live window accessor (the manager owns
 * the window reference and updates it on `setWindow`).
 */
export class HilNotifier {
  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  private resolveIcon(): Electron.NativeImage {
    const iconPath = brandIconPath();
    if (!iconPath) return nativeImage.createEmpty();
    try {
      const img = nativeImage.createFromPath(iconPath);
      return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 64, height: 64 });
    } catch {
      return nativeImage.createEmpty();
    }
  }

  /**
   * Raw toast XML that asks Windows for the long on-screen slot.
   *
   * Windows dismisses a standard toast after a few seconds, and the plain
   * `Notification` options cannot change that. A hand-off (`urgency: 'critical'`)
   * must survive a glance-away, so it goes out as XML with `duration="long"`
   * (~25s instead of ~7s). Audio and the icon live in the XML too: when
   * `toastXml` is set the other display options are ignored.
   */
  private longToastXml(title: string, message: string, silent: boolean): string {
    const esc = (value: string) =>
      value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const iconPath = brandIconPath();
    const icon = iconPath
      ? `<image placement="appLogoOverride" hint-crop="circle" src="${esc(pathToFileURL(iconPath).toString())}" />`
      : '';
    const audio = silent ? '<audio silent="true" />' : '<audio src="ms-winsoundevent:Notification.Default" />';
    return (
      `<toast duration="long">` +
      `<visual><binding template="ToastGeneric">` +
      `<text>${esc(title)}</text>` +
      `<text>${esc(message)}</text>` +
      icon +
      `</binding></visual>` +
      audio +
      `</toast>`
    );
  }

  /**
   * Dispatches a native desktop OS notification.
   */
  public send(options: NotificationOptions): boolean {
    try {
      if (Notification.isSupported()) {
        const silent = options.sound === false;
        // Long-slot XML first; if Windows rejects it, the plain toast still fires —
        // a hand-off alert must never disappear because a formatting path failed.
        let notif: Notification | null = null;
        if (process.platform === 'win32' && options.urgency === 'critical') {
          try {
            notif = new Notification({ toastXml: this.longToastXml(options.title || BRAND.product, options.message, silent) });
          } catch {
            notif = null;
          }
        }
        if (!notif) {
          notif = new Notification({
            title: options.title || BRAND.product,
            body: options.message,
            icon: this.resolveIcon(),
            urgency: options.urgency || 'normal',
            silent,
          });
        }

        notif.on('click', () => {
          this.bringWindowToFront();
        });

        notif.show();
        return true;
      }
    } catch {
      // Fallback
    }
    return false;
  }

  /**
   * Summons and focuses the main cyberdeck window, flashing the taskbar.
   *
   * Used when the human themselves clicks a notification: that is explicit intent,
   * so taking the foreground is correct here.
   */
  public bringWindowToFront(): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
    win.flashFrame(true);
  }

  /**
   * Surface the deck for a hand-off without stealing the foreground.
   *
   * The agent asking for help must never yank the window in front of someone who is
   * mid-task. Unhide it, flash the taskbar and let the long-lived toast + deck panel
   * wait; the human switches over when they choose (or clicks the toast, which does
   * focus).
   */
  public surfaceWindow(): void {
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;

    if (win.isMinimized()) {
      win.restore();
    }
    if (!win.isVisible()) {
      win.showInactive();
    }
    win.flashFrame(true);
  }
}
