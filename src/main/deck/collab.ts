/**
 * The collab wiring: the note cycle, the concise list popup and the providers
 * that connect the deck toolbar to the collaboration service and page overlay.
 *
 * Why a module: collab is a second responsibility inside the deck — it owns no
 * native view; it drives the page overlay through the active tab and shows its
 * list through the shared MenuPopup. Splitting it keeps the deck's geometry
 * file under budget and gives the overlay protocol one home.
 */
import type { BrowserWindow } from 'electron';
import type { CollaborationTarget, CollaborationThread } from '../../shared/collaboration.js';
import { MenuPopup } from '../ui/menu-popup.js';

/** When to use: building the deck — everything the collab cycle reads through. */
export interface CollabControllerDeps {
  /** The experimental gate; wired by index.ts to the persisted flag. */
  gate: () => boolean;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** The active page URL, for the thread filter. */
  pageUrl: () => string;
  /** The active tab's WebContents, for in-page overlay script execution. */
  activeWebContents: () => Electron.WebContents;
  /** Preload bundle for the shared menu popup. */
  popupPreloadPath: string;
  /** The window the note list anchors to. */
  window: () => BrowserWindow | null;
  /** The deck view's bounds, for anchoring the list to the toolbar pill. */
  viewBounds: () => Electron.Rectangle | null;
  /** Re-fit the deck view (entering/leaving swaps the orb for the toolbar pill). */
  reposition: () => void;
  /** Broadcast the surface state after an open/close toggle. */
  onStateChanged: () => void;
  /** Cancel an armed element picker (the chassis owns the selection state). */
  stopSelection: () => Promise<unknown> | void;
}

/** When to use: the deck surface — own the note cycle, list popup and overlay providers. */
export class CollabController {
  private readonly deps: CollabControllerDeps;
  private open = false;
  private focusIndex = -1;

  private threadsProvider?: (filter: { url: string }) => CollaborationThread[];
  private overlayRefresher?: () => Promise<void> | void;
  private resolver?: (id: string) => Promise<unknown> | unknown;
  private enabledGate: () => boolean = () => true;

  constructor(deps: CollabControllerDeps) {
    this.deps = deps;
  }

  /** Collab mode state: the deck geometry swaps the orb for the toolbar pill while true. */
  isOpen(): boolean {
    return this.open;
  }

  /** The focused thread index; -1 means none (drives the ▸ marker in the list). */
  focusedIndex(): number {
    return this.focusIndex;
  }

  isEnabled(): boolean {
    try {
      return this.enabledGate();
    } catch {
      return false;
    }
  }

  /**
   * Enter or leave collab mode. Entering injects the page overlay; leaving
   * clears the focus and removes it. Callers decide the deck-mode coupling.
   */
  setOpen(next: boolean): void {
    if (next === this.open) return;
    this.open = next;
    this.focusIndex = -1;
    void (async () => {
      try {
        if (next) {
          await this.overlayRefresher?.();
          await this.execute('window.__hbCollabEnterMode && window.__hbCollabEnterMode()');
        } else {
          await this.deps.stopSelection();
          await this.execute('window.__hbCollabExitMode && window.__hbCollabExitMode()');
        }
      } catch {
        // The page may be navigating; the mode state re-syncs on load.
      }
    })();
    this.deps.reposition();
    this.deps.onStateChanged();
  }

  /** Called when the gate turns off: leave collab mode and re-broadcast. */
  gateChanged(enabled: () => boolean): void {
    this.enabledGate = enabled;
    if (!enabled()) this.setOpen(false);
    this.deps.onStateChanged();
  }

  /**
   * Escape from the deck surface: cancels an armed picker, closes the element
   * toolbar and leaves collab mode. The deck owns keyboard focus right after a
   * radial-menu click, so page-level Escape handlers alone cannot see the key.
   * `pageEscape` runs the shell-level Escape script when collab is not open.
   */
  exitUi(pageEscape: () => void): void {
    void this.deps.stopSelection();
    if (this.open) {
      this.setOpen(false);
      return;
    }
    pageEscape();
  }

  /**
   * Move the collab note cycle by `delta` (-1/1). The focused thread is
   * flashed + scrolled into view by the page overlay (`__hbCollabShowThread`).
   */
  navigate(delta: number): void {
    if (!this.isEnabled()) return;
    const threads = this.openThreads();
    if (!threads.length) return;
    const step = Math.sign(delta || 1);
    const base = this.focusIndex < 0 ? (step < 0 ? 0 : -1) : this.focusIndex;
    this.focusIndex = (base + step + threads.length) % threads.length;
    this.cycleTo(threads[this.focusIndex].id);
  }

  /** Apply focus to a thread id; ensures the page overlay exists first. */
  private cycleTo(threadId: string): void {
    void (async () => {
      try {
        await this.overlayRefresher?.();
      } catch {
        // Refresh failures are non-fatal; the focus attempt is the visible part.
      }
      this.showThread(threadId);
    })();
  }

  /** The same thread set the page overlay displays, in display order. */
  private openThreads(): CollaborationThread[] {
    try {
      return (this.threadsProvider?.({ url: this.deps.pageUrl() }) ?? [])
        .filter((thread) => thread.status !== 'resolved');
    } catch {
      return [];
    }
  }

  private showThread(threadId: string): void {
    void this.execute(`window.__hbCollabShowThread && window.__hbCollabShowThread(${JSON.stringify(threadId)})`);
  }

  /**
   * Toggle the concise note list — a themed MenuPopup with one row per open
   * thread, anchored to the left of the toolbar pill. Clicking a row cycles to
   * that note on the page.
   */
  toggleList(anchor?: { x: number; y: number; width: number; height: number }): void {
    if (!this.isEnabled()) return;
    const pop = MenuPopup.shared(this.deps.popupPreloadPath);
    if (pop.isOpen) {
      pop.dismiss();
      return;
    }
    const threads = this.openThreads();
    const items = threads.length ? threads.map((thread, index) => {
      const text = thread.messages[0]?.text || thread.intent || thread.target.text || '';
      return {
        id: thread.id,
        label: `${index === this.focusIndex ? '▸ ' : ''}${thread.target.text || thread.target.name || 'element'}`.slice(0, 40),
        hint: `${thread.status} · ${text.slice(0, 46)}${text.length > 46 ? '…' : ''}`,
      };
    }) : [{ id: '__empty__', label: 'No open notes on this page', hint: 'Use the pen to select an element and add one.', disabled: true }];
    const sidebarBounds = this.deps.viewBounds();
    const win = this.deps.window();
    const pillAnchor =
      sidebarBounds && win && !win.isDestroyed()
        ? { x: sidebarBounds.x, y: sidebarBounds.y, width: 0, height: 0 }
        : (anchor ?? { x: 0, y: 0, width: 0, height: 0 });
    void pop.open(win as BrowserWindow, pillAnchor, items, { align: 'left-of', itemHeight: 56, width: 320 })
      .then((selection) => {
        if (!selection || selection.id === '__empty__') return;
        this.focusIndex = threads.findIndex((thread) => thread.id === selection.id);
        if (this.focusIndex >= 0) this.cycleTo(selection.id);
      });
  }

  /** Resolve from the in-page annotation card, then remove its highlight and advance. */
  async resolveNote(threadId: string): Promise<void> {
    if (!this.resolver) {
      this.deps.log('warn', 'Collaboration resolve action is unavailable.');
      return;
    }
    const before = this.openThreads();
    const resolvedIndex = before.findIndex((thread) => thread.id === threadId);
    try {
      await this.resolver(threadId);
      await this.overlayRefresher?.();
    } catch (error: any) {
      this.deps.log('warn', `Could not resolve collaboration note: ${error?.message || error}`);
      this.toast('Resolve failed — check the gateway.');
      return;
    }
    const remaining = this.openThreads();
    this.focusIndex = Math.min(resolvedIndex - 1, remaining.length - 1);
    if (this.open && remaining.length) this.navigate(1);
    else if (!remaining.length) this.focusIndex = -1;
    this.toast('Note resolved');
  }

  private toast(message: string): void {
    void this.execute(`window.__hbCollabToast && window.__hbCollabToast(${JSON.stringify(message)})`);
  }

  /** In-page script, best effort: the page may be mid-navigation. */
  private execute(script: string): Promise<unknown> | undefined {
    try {
      return this.deps.activeWebContents().executeJavaScript(script).catch(() => undefined);
    } catch {
      return undefined;
    }
  }

  // ---- Providers (wired by index.ts) -----------------------------------------------------

  setThreadsProvider(provider: (filter: { url: string }) => CollaborationThread[]): void {
    this.threadsProvider = provider;
  }

  setOverlayRefresher(refresh: () => Promise<void> | void): void {
    this.overlayRefresher = refresh;
  }

  setResolver(resolve: (id: string) => Promise<unknown> | unknown): void {
    this.resolver = resolve;
  }

  setEnabledProvider(enabled: () => boolean): void {
    this.gateChanged(enabled);
  }

  setClassListener(listener: (target: CollaborationTarget, added: string[], removed: string[]) => void): void {
    this.classListener = listener;
  }

  private classListener?: (target: CollaborationTarget, added: string[], removed: string[]) => void;

  /** Called by the chassis when a human edits classes on the page. */
  forwardClassEdit(target: CollaborationTarget, added: string[], removed: string[]): void {
    this.classListener?.(target, added, removed);
  }
}
