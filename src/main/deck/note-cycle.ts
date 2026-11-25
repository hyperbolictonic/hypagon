/**
 * The collab note cycle: focus, the concise list popup and resolve.
 *
 * Why a module: cycling notes, anchoring the list to the toolbar pill and
 * resolving from the in-page card share one piece of state (the focused index)
 * and one thread set. `CollabController` keeps the mode and the gate; this keeps
 * the navigation.
 */
import type { BrowserWindow } from 'electron';
import type { CollaborationThread } from '../../shared/collaboration.js';
import { MenuPopup } from '../ui/menu-popup.js';
import type { CollabProviders } from './collab-providers.js';
import { runInPage } from './page-script.js';

/** When to use: constructing the controller — the providers and the page lookups. */
export interface CollabNoteCycleDeps {
  providers: CollabProviders;
  pageUrl: () => string;
  popupPreloadPath: string;
  window: () => BrowserWindow | null;
  /** The deck view's bounds, for anchoring the list to the toolbar pill. */
  viewBounds: () => Electron.Rectangle | null;
  /** The active tab's WebContents, for in-page overlay script execution. */
  activeWebContents: () => Electron.WebContents;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Whether collab mode is on (resolve advances only while it is). */
  isOpen: () => boolean;
}

/** When to use: `CollabController` — own the focused note and its list. */
export class CollabNoteCycle {
  private focusIndex = -1;

  constructor(private readonly deps: CollabNoteCycleDeps) {}

  /** The focused thread index; -1 means none (drives the ▸ marker in the list). */
  focused(): number {
    return this.focusIndex;
  }

  /** Collab mode was entered or left: forget the focus. */
  reset(): void {
    this.focusIndex = -1;
  }

  /**
   * Move the collab note cycle by `delta` (-1/1). The focused thread is
   * flashed + scrolled into view by the page overlay (`__hbCollabShowThread`).
   */
  navigate(delta: number): void {
    if (!this.deps.providers.gate()) return;
    const threads = this.openThreads();
    if (!threads.length) return;
    const step = Math.sign(delta || 1);
    const base = this.focusIndex < 0 ? (step < 0 ? 0 : -1) : this.focusIndex;
    this.focusIndex = (base + step + threads.length) % threads.length;
    this.cycleTo(threads[this.focusIndex].id);
  }

  /**
   * Toggle the concise note list — a themed MenuPopup with one row per open
   * thread, anchored to the left of the toolbar pill. Clicking a row cycles to
   * that note on the page.
   */
  toggleList(anchor?: { x: number; y: number; width: number; height: number }): void {
    if (!this.deps.providers.gate()) return;
    const pop = MenuPopup.shared(this.deps.popupPreloadPath);
    if (pop.isOpen) {
      pop.dismiss();
      return;
    }
    const threads = this.openThreads();
    const items = threads.length
      ? threads.map((thread, index) => {
          const text = thread.messages[0]?.text || thread.intent || thread.target.text || '';
          return {
            id: thread.id,
            label: `${index === this.focusIndex ? '▸ ' : ''}${thread.target.text || thread.target.name || 'element'}`.slice(0, 40),
            hint: `${thread.status} · ${text.slice(0, 46)}${text.length > 46 ? '…' : ''}`,
          };
        })
      : [{ id: '__empty__', label: 'No open notes on this page', hint: 'Use the pen to select an element and add one.', disabled: true }];
    const sidebarBounds = this.deps.viewBounds();
    const win = this.deps.window();
    const pillAnchor =
      sidebarBounds && win && !win.isDestroyed()
        ? { x: sidebarBounds.x, y: sidebarBounds.y, width: 0, height: 0 }
        : (anchor ?? { x: 0, y: 0, width: 0, height: 0 });
    void pop
      .open(win as BrowserWindow, pillAnchor, items, { align: 'left-of', itemHeight: 56, width: 320 })
      .then((selection) => {
        if (!selection || selection.id === '__empty__') return;
        this.focusIndex = threads.findIndex((thread) => thread.id === selection.id);
        if (this.focusIndex >= 0) this.cycleTo(selection.id);
      });
  }

  /** Resolve from the in-page annotation card, then remove its highlight and advance. */
  async resolveNote(threadId: string): Promise<void> {
    const resolver = this.deps.providers.resolver;
    if (!resolver) {
      this.deps.log('warn', 'Collaboration resolve action is unavailable.');
      return;
    }
    const before = this.openThreads();
    const resolvedIndex = before.findIndex((thread) => thread.id === threadId);
    try {
      await resolver(threadId);
      await this.deps.providers.overlayRefresher?.();
    } catch (error: any) {
      this.deps.log('warn', `Could not resolve collaboration note: ${error?.message || error}`);
      this.toast('Resolve failed — check the gateway.');
      return;
    }
    const remaining = this.openThreads();
    this.focusIndex = Math.min(resolvedIndex - 1, remaining.length - 1);
    if (this.deps.isOpen() && remaining.length) this.navigate(1);
    else if (!remaining.length) this.focusIndex = -1;
    this.toast('Note resolved');
  }

  /** Apply focus to a thread id; ensures the page overlay exists first. */
  private cycleTo(threadId: string): void {
    void (async () => {
      try {
        await this.deps.providers.overlayRefresher?.();
      } catch {
        // Refresh failures are non-fatal; the focus attempt is the visible part.
      }
      this.showThread(threadId);
    })();
  }

  private openThreads(): CollaborationThread[] {
    return this.deps.providers.openThreads(this.deps.pageUrl());
  }

  private showThread(threadId: string): void {
    void runInPage(this.deps.activeWebContents, `window.__hbCollabShowThread && window.__hbCollabShowThread(${JSON.stringify(threadId)})`);
  }

  private toast(message: string): void {
    void runInPage(this.deps.activeWebContents, `window.__hbCollabToast && window.__hbCollabToast(${JSON.stringify(message)})`);
  }
}
