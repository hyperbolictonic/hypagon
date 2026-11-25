/**
 * Window boot sequence.
 *
 * Creating the shell window wires every surface that needs it: the HIL manager,
 * the HUD watchdog, the takeover shortcut, the tray, the download session, the
 * tab/viewport setup, the IPC channels and the deck. The order matters and lives
 * here instead of in the chassis.
 */
import type { BrowserWindow, Session } from 'electron';
import { isTakeoverShortcut } from '../takeover-key.js';

/** A finished download, as the boot hook reports it. */
export interface DownloadNotice {
  filename: string;
  totalBytes: number;
}

/** Dependencies the boot sequence needs from the chassis surfaces. */
export interface WindowBootDeps {
  setMainWindow(win: BrowserWindow): void;
  hilSetWindow(win: BrowserWindow): void;
  hudWatch(win: BrowserWindow): void;
  toggleHuman(): void;
  createTray(win: BrowserWindow): void;
  attachDownloads(session: Session): void;
  onDownloadComplete(handler: (record: DownloadNotice) => void): void;
  logDownload(record: DownloadNotice): void;
  setupTabs(): void;
  registerIpc(): void;
  setupDeck(): void;
}

/** The shell-window boot sequence, bound once. */
export class WindowBootSurface {
  private shortcutBound = false;
  private readonly deps: WindowBootDeps;

  constructor(deps: WindowBootDeps) {
    this.deps = deps;
  }

  window(win: BrowserWindow): void {
    this.deps.setMainWindow(win);
    this.deps.hilSetWindow(win);
    this.deps.hudWatch(win);

    if (!this.shortcutBound) {
      this.shortcutBound = true;
      win.webContents.on('before-input-event', (event, input) => {
        if (isTakeoverShortcut(input, process.platform)) {
          event.preventDefault();
          this.deps.toggleHuman();
        }
      });
    }

    this.deps.createTray(win);
    this.deps.attachDownloads(win.webContents.session);
    this.deps.onDownloadComplete((record) => this.deps.logDownload(record));
    this.deps.setupTabs();
    this.deps.registerIpc();
    this.deps.setupDeck();
  }
}
