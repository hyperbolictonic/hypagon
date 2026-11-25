/**
 * Human-in-the-loop hand-offs.
 *
 * The manager owns the request lifecycle (one pending request at a time), the
 * escalation to a human, and the teardown. Everything else is delegated:
 *
 *   - `hil-store.ts`    the request state machine (pending, timeout, resolve,
 *                       cancel, history) — no Electron, so it is testable
 *   - `hil-banner.ts`   the in-page banner script, injection, refresh and reload
 *   - `hil-notifier.ts` the desktop notification, window summon, HUD broadcasts
 *   - `hil-ipc.ts`      the four `hil:*` channels the HUD invokes
 *   - `hil-types.ts`    the request/resolution shapes
 */
import type { BrowserWindow } from 'electron';
import { BRAND } from '../../shared/brand.js';
import { HilPageBanner } from './hil-banner.js';
import { registerHilIpc } from './hil-ipc.js';
import { HilNotifier } from './hil-notifier.js';
import { HilRequestStore } from './hil-store.js';
import type { HilRequest, HilResolution } from './hil-types.js';

export type { HilRequest, HilResolution, NotificationOptions } from './hil-types.js';

/** When to use: the chassis — the window and the two fan-out hooks. */
export interface HilManagerOptions {
  mainWindow?: BrowserWindow;
  getActiveWebContents?: () => Electron.WebContents | null;
  onHilStateChanged?: (pending: boolean, req: HilRequest | null) => void;
  broadcastAll?: (channel: string, payload?: unknown) => void;
}

/** When to use: the chassis — own the hand-off lifecycle and its delivery. */
export class HilManager {
  private mainWindow: BrowserWindow | null = null;
  private getActiveWebContents?: () => Electron.WebContents | null;
  private onHilStateChanged?: (pending: boolean, req: HilRequest | null) => void;

  private readonly store = new HilRequestStore();
  /** The desktop/HUD delivery of a hand-off. */
  readonly notifier: HilNotifier;
  /** The in-page banner for the active hand-off. */
  readonly banner: HilPageBanner;

  constructor(options?: HilManagerOptions) {
    if (options?.mainWindow) this.mainWindow = options.mainWindow;
    this.getActiveWebContents = options?.getActiveWebContents;
    this.onHilStateChanged = options?.onHilStateChanged;

    this.notifier = new HilNotifier({ window: () => this.mainWindow, broadcastAll: options?.broadcastAll });
    this.banner = new HilPageBanner({
      getActiveWebContents: () => this.getActiveWebContents?.() ?? null,
      activeRequest: () => this.store.activeRequest(),
    });

    registerHilIpc({
      active: () => this.store.activeRequest(),
      resolve: (id, notes) => this.resolveIntervention(id, notes),
      cancel: (id) => this.cancelIntervention(id),
      reload: () => this.banner.reload(),
    });
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

  /**
   * Initiates a Human-In-The-Loop intervention request.
   * Halts agent execution until the user completes the action or timeout occurs.
   */
  public async requestIntervention(options: {
    reason: string;
    url?: string;
    timeoutSeconds?: number;
    bringToFront?: boolean;
    /** Default true. Research hand-offs use the app HIL toast instead. */
    inPageBanner?: boolean;
  }): Promise<HilResolution> {
    // If a request is already active, cancel it before starting new one
    if (this.store.activeRequest()) {
      this.cancelIntervention();
    }

    const timeoutSec = Math.max(5, Math.min(1800, options.timeoutSeconds ?? 180));
    const request: HilRequest = {
      id: `hil_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      reason: options.reason,
      url: options.url,
      requestedAt: Date.now(),
      timeoutSeconds: timeoutSec,
      status: 'pending',
    };

    this.banner.enabled = options.inPageBanner !== false;
    const targetWc = this.getActiveWebContents?.();
    const resolution = this.store.begin(request, () => {
      this.banner.remove(targetWc);
      this.notifier.clear();
      this.onHilStateChanged?.(false, null);
    });

    this.onHilStateChanged?.(true, request);

    // 1. Desktop Notification
    this.notifier.notify({
      title: `⚠️ Action Required: ${BRAND.deck}`,
      message: `${options.reason} (Window brought to front for input)`,
      urgency: 'critical',
      sound: true,
    });

    // 2. Bring window to front unless explicitly suppressed
    if (options.bringToFront !== false) {
      this.notifier.summon();
    }

    // 3. Inject In-Page Cyberdeck Alert Banner into active WebContents
    if (this.banner.enabled && targetWc && !targetWc.isDestroyed()) {
      this.banner.inject(request);
    }

    // 4. Notify Main Renderer HUD
    this.notifier.send('hil:requested', request);

    // 5. Return promise awaiting user resolution or timeout
    return resolution;
  }

  /**
   * Resolves the active intervention request (e.g. user clicked 'Resume Agent').
   */
  public resolveIntervention(id?: string, notes?: string): boolean {
    const resolvedNotes = notes || 'User confirmed action completed.';
    return this.store.close(id, 'resolved', resolvedNotes, resolvedNotes);
  }

  /** Cancels the active intervention request. */
  public cancelIntervention(id?: string): boolean {
    return this.store.close(id, 'cancelled', undefined, 'Human intervention was cancelled.');
  }

  public getActiveRequest(): HilRequest | null {
    return this.store.activeRequest();
  }

  public getHistory(): HilRequest[] {
    return this.store.entries();
  }
}
