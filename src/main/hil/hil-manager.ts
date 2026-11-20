import { BrowserWindow, ipcMain } from 'electron';
import { BRAND } from '../../shared/brand.js';
import { HilNotifier, type NotificationOptions } from './notifier.js';

export type { NotificationOptions } from './notifier.js';

/** When to use: reading the active hand-off (id, reason, timeout, status) in the deck or bridge. */
export interface HilRequest {
  id: string;
  reason: string;
  url?: string;
  requestedAt: number;
  timeoutSeconds: number;
  status: 'pending' | 'resolved' | 'timeout' | 'cancelled';
  resolvedAt?: number;
  notes?: string;
}

/** When to use: returning how a hand-off ended (resolved, timeout, cancelled) and elapsed time. */
export interface HilResolution {
  status: 'resolved' | 'timeout' | 'cancelled';
  elapsedSeconds: number;
  notes?: string;
}

const REMINDER_INTERVAL_MS = 60_000;

/** When to use: raising, resolving or inspecting human hand-offs; the deck and bridge share one instance. */
export class HilManager {
  private mainWindow: BrowserWindow | null = null;
  private notifier = new HilNotifier(() => this.mainWindow);
  private activeRequest: HilRequest | null = null;
  private activeResolver: ((res: HilResolution) => void) | null = null;
  private activeTimer: NodeJS.Timeout | null = null;
  /** While a request is pending: the next "still waiting" toast. */
  private reminderTimer: NodeJS.Timeout | null = null;
  private requestHistory: HilRequest[] = [];
  private onHilStateChanged?: (pending: boolean, req: HilRequest | null) => void;
  private getActiveWebContents?: () => Electron.WebContents | null;
  private broadcastAll?: (channel: string, payload?: unknown) => void;

  constructor(options?: {
    mainWindow?: BrowserWindow;
    getActiveWebContents?: () => Electron.WebContents | null;
    onHilStateChanged?: (pending: boolean, req: HilRequest | null) => void;
    broadcastAll?: (channel: string, payload?: unknown) => void;
  }) {
    if (options?.mainWindow) this.mainWindow = options.mainWindow;
    this.getActiveWebContents = options?.getActiveWebContents;
    this.onHilStateChanged = options?.onHilStateChanged;
    this.broadcastAll = options?.broadcastAll;

    this.registerIpcHandlers();
  }

  public setWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  public setActiveWebContentsGetter(getter: () => Electron.WebContents | null): void {
    this.getActiveWebContents = getter;
  }

  public setOnHilStateChanged(cb: (pending: boolean, req: HilRequest | null) => void): void {
    this.onHilStateChanged = cb;
  }

  private registerIpcHandlers(): void {
    ipcMain.handle('hil:get-active', () => {
      return this.activeRequest;
    });

    ipcMain.handle('hil:resolve', (_event, data?: { id?: string; notes?: string }) => {
      return this.resolveIntervention(data?.id, data?.notes);
    });

    ipcMain.handle('hil:cancel', (_event, data?: { id?: string }) => {
      return this.cancelIntervention(data?.id);
    });

    ipcMain.handle('hil:reload', () => this.reloadActive());
  }

  /**
   * Dispatches a native desktop OS notification (delegates to the notifier).
   */
  public sendNotification(options: NotificationOptions): boolean {
    return this.notifier.send(options);
  }

  /** Focus the deck because the human clicked the toast (explicit intent). */
  public bringWindowToFront(): void {
    this.notifier.bringWindowToFront();
  }

  /**
   * Initiates a Human-In-The-Loop intervention request.
   * Halts agent execution until the user completes the action or timeout occurs.
   */
  public async requestIntervention(options: {
    reason: string;
    url?: string;
    timeoutSeconds?: number;
    bringToFront?: boolean;
  }): Promise<HilResolution> {
    // If a request is already active, cancel it before starting new one
    if (this.activeRequest) {
      this.cancelIntervention();
    }

    const timeoutSec = Math.max(5, Math.min(1800, options.timeoutSeconds ?? 180));
    const reqId = `hil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const request: HilRequest = {
      id: reqId,
      reason: options.reason,
      url: options.url,
      requestedAt: Date.now(),
      timeoutSeconds: timeoutSec,
      status: 'pending',
    };

    this.activeRequest = request;
    this.onHilStateChanged?.(true, request);

    // 1. Desktop Notification
    this.notifier.send({
      title: `⚠️ Action Required: ${BRAND.deck}`,
      message: `${options.reason} (The deck is waiting for you)`,
      urgency: 'critical',
      sound: true,
    });

    // 1b. A toast lives for seconds; a hand-off missed in a glance is a hand-off lost.
    // Nudge again every minute while nobody answers, pointing at the tray icon —
    // the one restore path that works even when the toast's own click cannot route.
    const nudge = () => {
      this.reminderTimer = setTimeout(() => {
        if (this.activeRequest?.id !== reqId || this.activeRequest.status !== 'pending') return;
        this.notifier.send({
          title: `⏳ Still waiting: ${BRAND.deck}`,
          message: `${options.reason.split('\n')[0].slice(0, 80)} — reopen the deck from the tray icon to answer it.`,
          urgency: 'critical',
          sound: true,
        });
        nudge();
      }, REMINDER_INTERVAL_MS);
    };
    nudge();

    // 2. Surface the deck unless explicitly suppressed. Never steal focus: the
    // agent asking for help must not interrupt someone mid-task.
    if (options.bringToFront !== false) {
      this.notifier.surfaceWindow();
    }

    // 3. Notify the renderer: the Command Deck swaps into its hand-off panel.
    // No page injection: the deck is the one HIL surface, so the page a human
    // needs to look at is never covered.
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('hil:requested', request);
    }
    this.broadcastAll?.('hil:requested', request);

    // 4. Return promise awaiting user resolution or timeout
    return new Promise<HilResolution>((resolve) => {
      this.activeResolver = resolve;

      this.activeTimer = setTimeout(() => {
        if (this.activeRequest?.id === reqId && this.activeRequest.status === 'pending') {
          this.activeRequest.status = 'timeout';
          this.activeRequest.resolvedAt = Date.now();
          this.clearReminder();
          this.cleanup();

          const elapsed = Math.round((Date.now() - request.requestedAt) / 1000);
          this.requestHistory.push(this.activeRequest);
          this.activeRequest = null;
          this.onHilStateChanged?.(false, null);

          resolve({
            status: 'timeout',
            elapsedSeconds: elapsed,
            notes: `Human intervention timed out after ${elapsed} seconds.`,
          });
        }
      }, timeoutSec * 1000);
    });
  }

  /**
   * Resolves the active intervention request (e.g. user clicked 'Resume Agent').
   */
  public resolveIntervention(id?: string, notes?: string): boolean {
    if (!this.activeRequest || this.activeRequest.status !== 'pending') {
      return false;
    }

    if (id && this.activeRequest.id !== id) {
      return false;
    }

    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.clearReminder();

    this.activeRequest.status = 'resolved';
    this.activeRequest.resolvedAt = Date.now();
    this.activeRequest.notes = notes || 'User confirmed action completed.';

    const elapsed = Math.round((Date.now() - this.activeRequest.requestedAt) / 1000);
    const resolvedReq = this.activeRequest;

    this.cleanup();

    this.requestHistory.push(resolvedReq);
    this.activeRequest = null;
    this.onHilStateChanged?.(false, null);

    if (this.activeResolver) {
      const resolver = this.activeResolver;
      this.activeResolver = null;
      resolver({
        status: 'resolved',
        elapsedSeconds: elapsed,
        notes: resolvedReq.notes,
      });
    }

    return true;
  }

  /**
   * Cancels the active intervention request.
   */
  public cancelIntervention(id?: string): boolean {
    if (!this.activeRequest || this.activeRequest.status !== 'pending') {
      return false;
    }

    if (id && this.activeRequest.id !== id) {
      return false;
    }

    if (this.activeTimer) {
      clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    this.clearReminder();

    this.activeRequest.status = 'cancelled';
    this.activeRequest.resolvedAt = Date.now();
    const elapsed = Math.round((Date.now() - this.activeRequest.requestedAt) / 1000);
    const cancelledReq = this.activeRequest;

    this.cleanup();

    this.requestHistory.push(cancelledReq);
    this.activeRequest = null;
    this.onHilStateChanged?.(false, null);

    if (this.activeResolver) {
      const resolver = this.activeResolver;
      this.activeResolver = null;
      resolver({
        status: 'cancelled',
        elapsedSeconds: elapsed,
        notes: 'Human intervention was cancelled.',
      });
    }

    return true;
  }

  public getActiveRequest(): HilRequest | null {
    return this.activeRequest;
  }

  /** Reloads the page under hand-off (a stale challenge often clears on refresh). */
  public reloadActive(): boolean {
    if (!this.activeRequest || this.activeRequest.status !== 'pending') return false;
    const wc = this.getActiveWebContents?.();
    if (!wc || wc.isDestroyed()) return false;
    wc.reload();
    return true;
  }

  public getHistory(): HilRequest[] {
    return [...this.requestHistory];
  }

  /** Stop the pending-hand-off nudge; called from every terminal path. */
  private clearReminder(): void {
    if (this.reminderTimer) {
      clearTimeout(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  private cleanup(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.flashFrame(false);
      this.mainWindow.webContents.send('hil:cleared');
    }
    this.broadcastAll?.('hil:cleared');
  }

}
