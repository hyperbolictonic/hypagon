/**
 * The system tray: the icon, its context menu and the window's tray behaviour.
 *
 * Why this file is small: `window-visibility.ts` owns show/hide/toggle and the rule that a focused
 * window toggles away, `close-to-tray.ts` owns the close interception and its three flags,
 * `tray-menu.ts` builds the menu from state plus actions, and `notifications.ts` owns the one-time
 * "still running" notice. This class owns the Tray instance and the status the menu displays.
 */
import { app, Menu, Tray, type BrowserWindow } from 'electron';
import { brandIcon } from '../brand-icon.js';
import { CloseToTray } from './close-to-tray.js';
import { notifyTrayHidden } from './notifications.js';
import { trayMenuTemplate } from './tray-menu.js';
import { WindowVisibility } from './window-visibility.js';

/** When to use: constructing the tray — the window plus the quit/show/hide hooks. */
export interface TrayManagerOptions {
  mainWindow: BrowserWindow;
  onQuit?: () => void;
  onShow?: () => void;
  onHide?: () => void;
  closeToTrayDefault?: boolean;
}

/** When to use: app startup — own the tray icon, its menu and the close-to-tray behaviour. */
export class TrayManager {
  private tray: Tray | null = null;
  private agentStatus: string = 'IDLE';
  private tabCount: number = 0;
  private hilPending: boolean = false;

  private readonly onQuit?: () => void;
  private readonly window: WindowVisibility;
  private readonly closeToTray: CloseToTray;

  constructor(options: TrayManagerOptions) {
    this.onQuit = options.onQuit;
    this.window = new WindowVisibility({
      window: options.mainWindow,
      onChange: () => this.updateMenu(),
      onShow: options.onShow,
      onHide: options.onHide,
    });
    this.closeToTray = new CloseToTray({
      window: options.mainWindow,
      enabled: options.closeToTrayDefault === true,
      hide: () => this.hideWindow(),
      onFirstHide: () => notifyTrayHidden(this.tray),
    });

    // The icon is created after the collaborators so the first menu already reads real state.
    this.tray = new Tray(brandIcon(16));
    this.tray.setToolTip('Kuang Grade Mark Eleven // Cyberdeck');
    this.tray.on('click', () => this.toggleWindow());
    this.tray.on('double-click', () => this.showWindow());
    this.updateMenu();
  }

  /** Rebuild the context menu from the current status, skills and window state. */
  public updateMenu(): void {
    if (!this.tray) return;
    const contextMenu = Menu.buildFromTemplate(
      trayMenuTemplate(
        {
          visible: this.window.isVisible(),
          closeToTray: this.closeToTray.isEnabled(),
          hilPending: this.hilPending,
          status: this.agentStatus,
          tabCount: this.tabCount,
        },
        {
          show: () => this.showWindow(),
          toggle: () => this.toggleWindow(),
          setCloseToTray: (enabled) => this.closeToTray.setEnabled(enabled),
          quit: () => {
            this.closeToTray.beginQuit();
            if (this.onQuit) this.onQuit();
            else app.quit();
          },
        },
      ),
    );
    this.tray.setContextMenu(contextMenu);
  }

  public showWindow(): void {
    this.window.show();
  }

  public hideWindow(): void {
    this.window.hide();
  }

  public toggleWindow(): void {
    this.window.toggle();
  }

  public updateStatus(status: string, tabCount: number, hilPending: boolean = false): void {
    this.agentStatus = status;
    this.tabCount = tabCount;
    this.hilPending = hilPending;
    this.updateMenu();
  }

  public setCloseToTray(enabled: boolean): void {
    this.closeToTray.setEnabled(enabled);
    this.updateMenu();
  }

  public isCloseToTray(): boolean {
    return this.closeToTray.isEnabled();
  }

  public isWindowVisible(): boolean {
    return this.window.isVisible();
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
