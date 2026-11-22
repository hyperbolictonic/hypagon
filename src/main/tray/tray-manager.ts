import { app, BrowserWindow, Menu, Tray, Notification } from 'electron';
import { brandIcon } from '../brand-icon.js';
import path from 'node:path';
import fs from 'node:fs';

export interface TrayManagerOptions {
  mainWindow: BrowserWindow;
  onQuit?: () => void;
  onShow?: () => void;
  onHide?: () => void;
  closeToTrayDefault?: boolean;
}

export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow;
  private isQuitting: boolean = false;
  private closeToTray: boolean = false;
  private agentStatus: string = 'IDLE';
  private tabCount: number = 0;
  private hilPending: boolean = false;
  private hasShownTrayNotice: boolean = false;

  private onQuit?: () => void;
  private onShow?: () => void;
  private onHide?: () => void;

  constructor(options: TrayManagerOptions) {
    this.mainWindow = options.mainWindow;
    this.onQuit = options.onQuit;
    this.onShow = options.onShow;
    this.onHide = options.onHide;
    if (typeof options.closeToTrayDefault === 'boolean') {
      this.closeToTray = options.closeToTrayDefault;
    }

    this.initTray();
    this.setupWindowListeners();
  }

  private resolveIcon(): Electron.NativeImage {
    return brandIcon(16);
  }

  private initTray(): void {
    const icon = this.resolveIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Kuang Grade Mark Eleven // Cyberdeck');

    this.tray.on('click', () => {
      this.toggleWindow();
    });

    this.tray.on('double-click', () => {
      this.showWindow();
    });

    this.updateMenu();
  }

  private setupWindowListeners(): void {
    // Intercept window close to minimize to tray if enabled
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting && this.closeToTray) {
        event.preventDefault();
        this.hideWindow();

        if (!this.hasShownTrayNotice) {
          this.hasShownTrayNotice = true;
          this.notifyTrayRunning();
        }
      }
    });

    // App before-quit lifecycle
    app.on('before-quit', () => {
      this.isQuitting = true;
    });
  }

  private notifyTrayRunning(): void {
    if (this.tray && process.platform === 'win32') {
      try {
        this.tray.displayBalloon({
          title: 'Mark Eleven Minimized',
          content: 'Kuang Grade Mark Eleven is continuing in the system tray. Click the tray icon to restore.',
          iconType: 'info',
        });
      } catch {
        // Fallback to desktop notification
        this.showDesktopNotification('Mark Eleven Running', 'Cyberdeck minimized to system tray. Active tasks remain online.');
      }
    } else {
      this.showDesktopNotification('Mark Eleven Running', 'Cyberdeck minimized to system tray. Active tasks remain online.');
    }
  }

  private showDesktopNotification(title: string, body: string): void {
    if (Notification.isSupported()) {
      new Notification({
        title,
        body,
        silent: true,
      }).show();
    }
  }

  public updateMenu(): void {
    if (!this.tray) return;

    const isVisible = this.mainWindow.isVisible() && !this.mainWindow.isMinimized();
    const hilLabel = this.hilPending ? '⚠️ ACTION REQUIRED (Human Intervention)' : 'Human Intervention: None';

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Kuang Grade Mark Eleven',
        enabled: false,
      },
      {
        label: `Status: ${this.agentStatus} | Tabs: ${this.tabCount}`,
        enabled: false,
      },
      ...(this.hilPending
        ? [
            {
              label: '⚠️ Resolve Action Required',
              click: () => {
                this.showWindow();
              },
            },
          ]
        : []),
      { type: 'separator' },
      {
        label: isVisible ? 'Hide to Tray' : 'Show Window',
        click: () => {
          this.toggleWindow();
        },
      },
      {
        label: 'Minimize to Tray on Close',
        type: 'checkbox',
        checked: this.closeToTray,
        click: (item) => {
          this.closeToTray = item.checked;
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Cyberdeck',
        click: () => {
          this.isQuitting = true;
          if (this.onQuit) {
            this.onQuit();
          } else {
            app.quit();
          }
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public showWindow(): void {
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.show();
    this.mainWindow.focus();
    this.updateMenu();
    this.onShow?.();
  }

  public hideWindow(): void {
    this.mainWindow.hide();
    this.updateMenu();
    this.onHide?.();
  }

  public toggleWindow(): void {
    if (this.mainWindow.isVisible() && !this.mainWindow.isMinimized() && this.mainWindow.isFocused()) {
      this.hideWindow();
    } else {
      this.showWindow();
    }
  }

  public updateStatus(status: string, tabCount: number, hilPending: boolean = false): void {
    this.agentStatus = status;
    this.tabCount = tabCount;
    this.hilPending = hilPending;
    this.updateMenu();
  }

  public setCloseToTray(enabled: boolean): void {
    this.closeToTray = enabled;
    this.updateMenu();
  }

  public isCloseToTray(): boolean {
    return this.closeToTray;
  }

  public isWindowVisible(): boolean {
    return this.mainWindow.isVisible() && !this.mainWindow.isMinimized();
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
