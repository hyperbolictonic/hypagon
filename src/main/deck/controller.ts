/**
 * The deck: the docked/floating/collapsed panel over the page, and its orb chip.
 *
 * Why this file is small: the native view and its bounds animation are
 * `deck/panel.ts`, the collapsed chip's edge and drag are `deck/orb.ts`, the
 * geometry arithmetic is `deck/bounds.ts`, and the note-cycle/list/providers are
 * `deck/collab.ts` (it owns no native view and drives the page overlay). This
 * class is the composition: the mode state, the collab coupling and the
 * surface-state broadcast.
 *
 * The authoritative surface state is broadcast on every transition and
 * re-asserted after panel reloads, so DOM classes and native bounds can never
 * drift apart.
 */
import type { BrowserWindow, WebContentsView } from 'electron';
import type { SidebarSurfaceState } from '../../shared/menu.js';
import { CollabController } from './collab.js';
import type { DeckMode } from './bounds.js';
import { DeckPanel } from './panel.js';
import { DeckOrb } from './orb.js';

export type { DeckEdge, DeckMode } from './bounds.js';

/** When to use: building the chassis — everything the deck reads through. */
export interface DeckControllerDeps {
  window: () => BrowserWindow | null;
  /** Load the panel renderer (dev server or packaged file) into a fresh view. */
  loadPanel: (view: WebContentsView) => void;
  /** Preload bundle for the shared menu popup. */
  popupPreloadPath: string;
  /** The active tab's WebContents, for in-page collab script execution. */
  activeWebContents: () => Electron.WebContents;
  /** The active page URL, for the collab thread filter. */
  pageUrl: () => string;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** The browsing view re-fits after a docked/floating change. */
  onModeChanged: () => void;
  /** Send to the shell window (the deck sends to its own view as well). */
  sendToShell: (channel: string, payload: unknown) => void;
  /** Fired after the panel (re)loads, before the state sync. */
  onPanelLoaded: () => void;
  /** Cancel an armed element picker (the chassis owns the selection state). */
  stopSelection: () => Promise<unknown> | void;
}

/** When to use: the chassis — compose the panel, the orb and the collab wiring. */
export class DeckController {
  private readonly deps: DeckControllerDeps;
  private mode: DeckMode = 'floating';
  private lastOpenMode: 'docked' | 'floating' = 'floating';

  /** The native panel view and its bounds. */
  readonly panel: DeckPanel;
  /** The collapsed chip's edge and drag. */
  readonly orb: DeckOrb;
  /** The note cycle, list popup and overlay providers. */
  readonly collab: CollabController;

  constructor(deps: DeckControllerDeps) {
    this.deps = deps;

    this.panel = new DeckPanel({
      window: deps.window,
      loadPanel: deps.loadPanel,
      popupPreloadPath: deps.popupPreloadPath,
      mode: () => this.mode,
      collabOpen: () => this.collab.isOpen(),
      edge: () => this.orb.getEdge(),
      log: deps.log,
      onLoaded: () => {
        deps.onPanelLoaded();
        // A page reload resets the sidebar DOM to its optimistic state while the
        // native bounds keep the previous shape; re-assert both so they can never
        // diverge (this is the "stuck open" desync class of bugs).
        this.position();
        this.broadcastState();
      },
    });

    this.orb = new DeckOrb({
      window: deps.window,
      panel: () => this.panel,
      mode: () => this.mode,
      reposition: (animate) => this.panel.position(animate),
      onChanged: () => this.broadcastState(),
    });

    this.collab = new CollabController({
      gate: () => true,
      log: (level, message) => deps.log(level, message),
      pageUrl: () => deps.pageUrl(),
      activeWebContents: () => deps.activeWebContents(),
      popupPreloadPath: deps.popupPreloadPath,
      window: () => deps.window(),
      viewBounds: () => this.panel.getView()?.getBounds() ?? null,
      reposition: () => this.panel.position(true),
      onStateChanged: () => this.broadcastState(),
      stopSelection: () => deps.stopSelection(),
    });
  }

  getMode(): DeckMode {
    return this.mode;
  }

  setMode(mode: DeckMode): void {
    if (mode !== 'docked' && mode !== 'floating' && mode !== 'collapsed') return;
    if (mode === 'docked' || mode === 'floating') this.lastOpenMode = mode;
    const previous = this.mode;
    this.mode = mode;
    // Leaving collapsed mode also leaves collab mode.
    if (mode !== 'collapsed' && this.collab.isOpen()) {
      this.collab.setOpen(false);
    }
    this.deps.log('action', `Sidebar mode: ${mode}`);
    // Animate only real transitions; arriving in the requested mode again snaps.
    this.position(mode !== previous);
    this.deps.onModeChanged();
    this.broadcastState();
  }

  toggleMode(): void {
    if (this.mode === 'collapsed') {
      this.setMode(this.lastOpenMode);
    } else {
      this.lastOpenMode = this.mode;
      this.setMode('collapsed');
    }
  }

  surfaceState(): SidebarSurfaceState {
    return {
      mode: this.mode,
      collabMode: this.collab.isOpen(),
      collabEnabled: this.collab.isEnabled(),
      orbEdge: this.orb.getEdge(),
    };
  }

  /** Place the panel view (resizes, visibility changes, viewport recovery). */
  position(animate = false): void {
    this.panel.position(animate);
  }

  /**
   * Collab mode: while the deck is collapsed, the orb is replaced by a small
   * collaborations toolbar (cycle notes, concise list, pick element) wired to
   * the page overlay. Entering cancels the radial stage and any picking.
   */
  setCollabMode(open: boolean): void {
    const next = Boolean(open);
    if (next && !this.collab.isEnabled()) {
      this.deps.log('info', 'Collab mode is disabled — enable it in Settings → Experimental.');
      return;
    }
    if (next === this.collab.isOpen()) return;
    if (next && this.mode !== 'collapsed') this.setMode('collapsed');
    this.collab.setOpen(next);
  }

  exitCollabUi(): void {
    this.collab.exitUi(() => {
      // Not in collab mode: clear the page-level picker and element toolbar.
      try {
        const wc = this.deps.activeWebContents();
        void wc
          .executeJavaScript(
            '(() => { window.__kuangCollabSelectionCancel && window.__kuangCollabSelectionCancel(); window.__hbCollabClearElementBar && window.__hbCollabClearElementBar(); })()',
          )
          .catch(() => undefined);
      } catch {
        // The active tab may be mid-navigation; nothing is left to clean up.
      }
    });
  }

  private broadcastState(): void {
    const state = this.surfaceState();
    this.deps.sendToShell('chassis:sidebar-state', state);
    this.panel.send('chassis:sidebar-state', state);
  }
}
