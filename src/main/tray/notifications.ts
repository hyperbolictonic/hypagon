/**
 * The one-time "still running in the tray" notice.
 *
 * Why a module: Windows gets a tray balloon (with a desktop-notification fallback when the balloon
 * is unavailable) and every other platform gets the desktop notification directly. That rule was
 * inline in the tray manager next to the icon setup.
 */
import { Notification, type Tray } from 'electron';

/** When to use: any surface that needs a silent desktop notification. */
export function showDesktopNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
      silent: true,
    }).show();
  }
}

/** When to use: the first time a close is intercepted — explain where the app went. */
export function notifyTrayHidden(tray: Tray | null): void {
  const body = 'Cyberdeck minimized to system tray. Active tasks remain online.';
  if (tray && process.platform === 'win32') {
    try {
      tray.displayBalloon({
        title: 'Mark Eleven Minimized',
        content: 'Kuang Grade Mark Eleven is continuing in the system tray. Click the tray icon to restore.',
        iconType: 'info',
      });
      return;
    } catch {
      // Fall through to the desktop notification.
    }
  }
  showDesktopNotification('Mark Eleven Running', body);
}
