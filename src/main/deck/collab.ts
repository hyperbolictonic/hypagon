/**
 * The collab wiring: the mode, the experimental gate, and the escape path.
 *
 * Why a module: collab is a second responsibility inside the deck — it owns no
 * native view; it drives the page overlay through the active tab. The note cycle
 * and the list popup live in `note-cycle.ts`, and the service hooks are plain
 * fields in `collab-providers.ts`, so this class is only the state that has to
 * react: open/closed and the gate.
 */
import type { BrowserWindow } from 'electron';
import { CollabNoteCycle } from './note-cycle.js';
import { CollabProviders } from './collab-providers.js';
import { runInPage } from './page-script.js';

/** When to use: building the deck — everything the collab wiring reads through. */
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

/** When to use: the deck surface — own the collab mode, gate and note cycle. */
export class CollabController {
  private readonly deps: CollabControllerDeps;
  private open = false;

  /** The service/overlay hooks; wired by the boot (see `CollabProviders`). */
  readonly providers: CollabProviders;
  /** The focused note, its cycle and the concise list. */
  readonly cycle: CollabNoteCycle;

  constructor(deps: CollabControllerDeps) {
    this.deps = deps;
    this.providers = new CollabProviders();
    this.providers.gate = deps.gate;
    this.cycle = new CollabNoteCycle({
      providers: this.providers,
      pageUrl: deps.pageUrl,
      popupPreloadPath: deps.popupPreloadPath,
      window: deps.window,
      viewBounds: deps.viewBounds,
      activeWebContents: deps.activeWebContents,
      log: deps.log,
      isOpen: () => this.open,
    });
  }

  /** Collab mode state: the deck geometry swaps the orb for the toolbar pill while true. */
  isOpen(): boolean {
    return this.open;
  }

  isEnabled(): boolean {
    try {
      return this.providers.gate();
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
    this.cycle.reset();
    void (async () => {
      try {
        if (next) {
          await this.providers.overlayRefresher?.();
          await runInPage(this.deps.activeWebContents, 'window.__hbCollabEnterMode && window.__hbCollabEnterMode()');
        } else {
          await this.deps.stopSelection();
          await runInPage(this.deps.activeWebContents, 'window.__hbCollabExitMode && window.__hbCollabExitMode()');
        }
      } catch {
        // The page may be navigating; the mode state re-syncs on load.
      }
    })();
    this.deps.reposition();
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

  /** The experimental gate changed: leave collab mode when it turns off, then re-broadcast. */
  setEnabledProvider(enabled: () => boolean): void {
    this.providers.gate = enabled;
    if (!enabled()) this.setOpen(false);
    this.deps.onStateChanged();
  }
}
