/**
 * The deck: the docked/floating/collapsed panel over the page, and its orb chip.
 *
 * Why a module: the chassis carried eight deck fields and a dozen methods that
 * only reasoned about each other — the native view and its bounds animation,
 * mode transitions, and the orb drag choreography. One controller owns the
 * geometry; the collab wiring lives in deck/collab.ts (it owns no native view
 * and drives the page overlay instead). The chassis keeps thin delegations,
 * and the browsing view's bounds still re-fit on every mode change.
 *
 * The authoritative surface state is broadcast on every transition and
 * re-asserted after panel reloads, so DOM classes and native bounds can never
 * drift apart.
 */
import { BrowserWindow, WebContentsView } from 'electron';
import type { CollaborationTarget, CollaborationThread } from '../../shared/collaboration.js';
import type { SidebarSurfaceState } from '../../shared/menu.js';
import { CollabController } from './collab.js';

/** Deck geometry. The panel sits over the page, clear of the scrollbar track. */
const PAGE_SCROLLBAR_GUTTER = 16;
/** Width of the Command Deck HUD (docked and floating). */
const PANEL_WIDTH = 420;
/** Orb chip size and screen margin. The native view is larger than the visible
 *  chip so hover scale, the pulse ring and the count badge never clip. */
const DECK_ORB_SIZE = 56;
const DECK_ORB_VIEW = 84;
const DECK_ORB_VIEW_PAD = (DECK_ORB_VIEW - DECK_ORB_SIZE) / 2;
const DECK_ORB_MARGIN = 12;
/** Collab-mode toolbar pill: the orb is replaced by this bar. */
const TOOLBAR_BAR_WIDTH = 248;
/** Sidebar transition duration, shared by the native bounds animation and the panel's CSS reveal. */
const SIDEBAR_TRANSITION_MS = 240;

/** When to use: a surface that stores or compares the deck's panel state. */
export type DeckMode = 'docked' | 'floating' | 'collapsed';
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

/** When to use: the chassis — own the deck panel view, its modes and orb geometry. */
export class DeckController {
  private readonly deps: DeckControllerDeps;

  private view: WebContentsView | null = null;
  private mode: DeckMode = 'floating';
  private lastOpenMode: 'docked' | 'floating' = 'floating';
  private boundsAnimation: { cancelled: boolean } | null = null;
  private orbEdge: 'left' | 'right' = 'right';
  private overlayVisible = true;

  /** The collab wiring; it owns no native view, only the page overlay protocol. */
  private readonly collab: CollabController;

  constructor(deps: DeckControllerDeps) {
    this.deps = deps;
    this.collab = new CollabController({
      gate: () => true,
      log: (level, message) => deps.log(level, message),
      pageUrl: () => deps.pageUrl(),
      activeWebContents: () => deps.activeWebContents(),
      popupPreloadPath: deps.popupPreloadPath,
      window: () => deps.window(),
      viewBounds: () => this.view?.getBounds() ?? null,
      reposition: () => this.position(true),
      onStateChanged: () => this.broadcastState(),
      stopSelection: () => deps.stopSelection(),
    });
  }

  getMode(): DeckMode {
    return this.mode;
  }

  getView(): WebContentsView | null {
    return this.view;
  }

  /** Create the panel view, load the renderer and take the first position. */
  setup(): void {
    const win = this.deps.window();
    if (!win) return;

    this.view = new WebContentsView({
      webPreferences: {
        preload: this.deps.popupPreloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        // The preload is an ESM bundle; sandboxed preloads must be CJS. The
        // overlay only loads our local index.html, so context isolation is the
        // relevant boundary here.
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    this.view.setBackgroundColor('#00000000');
    win.contentView.addChildView(this.view);

    try {
      this.deps.loadPanel(this.view);
    } catch (err: any) {
      this.deps.log('warn', `Sidebar overlay failed to load: ${err?.message || err}`);
    }

    this.view.webContents.on('did-finish-load', () => {
      this.deps.onPanelLoaded();
      // A page reload resets the sidebar DOM to its optimistic state while the
      // native bounds keep the previous shape; re-assert both so they can never
      // diverge (this is the "stuck open" desync class of bugs).
      this.sync();
    });

    this.position();
  }

  /** Send to the panel view only (used by the chassis for boot-time state). */
  sendToPanel(channel: string, payload: unknown): void {
    const wc = this.view?.webContents;
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
  }

  private sendEverywhere(channel: string, payload: unknown): void {
    this.deps.sendToShell(channel, payload);
    this.sendToPanel(channel, payload);
  }

  pageInset(): number {
    if (!this.overlayVisible) return 0;
    if (this.mode !== 'floating') return 0;
    return PANEL_WIDTH + PAGE_SCROLLBAR_GUTTER;
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

  /**
   * Interpolate the panel view into `target` bounds. Native views cannot be
   * moved by CSS, so the main process steps the bounds on the same easing the
   * panel's DOM reveal uses, keeping view and content in lockstep.
   */
  private animate(target: Electron.Rectangle): void {
    const win = this.deps.window();
    if (!win || !this.view) return;
    if (this.boundsAnimation) this.boundsAnimation.cancelled = true;
    const token = { cancelled: false };
    this.boundsAnimation = token;

    const start = this.view.getBounds();
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const dw = target.width - start.width;
    const dh = target.height - start.height;
    if (!dx && !dy && !dw && !dh) return;

    const startedAt = Date.now();
    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    const step = (): void => {
      if (token.cancelled || !this.view || !this.view.webContents) return;
      const progress = Math.min(1, (Date.now() - startedAt) / SIDEBAR_TRANSITION_MS);
      const eased = easeOutCubic(progress);
      this.view.setBounds({
        x: Math.round(start.x + dx * eased),
        y: Math.round(start.y + dy * eased),
        width: Math.round(start.width + dw * eased),
        height: Math.round(start.height + dh * eased),
      });
      if (progress < 1) {
        setTimeout(step, 16);
      } else {
        // Shrinking a transparent WebContentsView can leave stale pixels from
        // the previous larger root layer on Windows; force a clean repaint.
        this.view?.webContents.invalidate();
      }
    };
    step();
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
      orbEdge: this.orbEdge,
    };
  }

  setOverlayVisible(visible: boolean): void {
    this.overlayVisible = visible;
    this.position();
  }

  /** Re-attach after a tab creates a new native view; the deck stays on top. */
  bringToFront(): void {
    const win = this.deps.window();
    if (!win || !this.view) return;
    try {
      win.contentView.removeChildView(this.view);
      win.contentView.addChildView(this.view);
    } catch {
      // The window can be mid-teardown.
    }
    this.position();
  }

  position(animate = false): void {
    const win = this.deps.window();
    if (!win || !this.view) return;
    // A snap (window resize, visibility change) invalidates a running
    // transition; the direct setBounds below must be its final word.
    if (this.boundsAnimation) this.boundsAnimation.cancelled = true;
    if (!this.overlayVisible) {
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }

    // Child-view bounds are relative to the content area (excluding the title
    // bar and menu), so read the content size instead of the outer size.
    const [winWidth, winHeight] = win.getContentSize();
    // Leave the page's right-edge scrollbar out from under the panel. The browsing view spans the
    // full window width (floating panels sit *over* the page), so a panel flush to the right edge
    // covers the scrollbar track completely and the page becomes undraggable by hand.
    const scrollbarGutter = PAGE_SCROLLBAR_GUTTER;
    const usableWidth = Math.max(0, winWidth - scrollbarGutter);

    if (this.mode === 'collapsed') {
      // The collapsed deck shrinks to a free-floating orb chip anchored at a
      // bottom corner, clear of the scrollbar track. The native view is the
      // chip plus padding (hover scale, pulse ring, count badge must not clip).
      // In collab mode the orb is replaced by a horizontal toolbar pill with
      // its own sized view, same corner.
      const orbView = { width: DECK_ORB_VIEW, height: DECK_ORB_VIEW };
      const pillView = { width: TOOLBAR_BAR_WIDTH + 2 * DECK_ORB_VIEW_PAD, height: DECK_ORB_VIEW };
      const viewSize = this.collab.isOpen() ? pillView : orbView;
      const anchorX = this.orbEdge === 'left'
        ? Math.max(0, DECK_ORB_MARGIN - DECK_ORB_VIEW_PAD)
        : usableWidth - DECK_ORB_MARGIN + DECK_ORB_VIEW_PAD;
      const bounds = {
        x: Math.max(0, anchorX - viewSize.width),
        y: Math.max(0, winHeight - DECK_ORB_MARGIN + DECK_ORB_VIEW_PAD - viewSize.height),
        width: viewSize.width,
        height: viewSize.height,
      };
      if (animate) this.animate(bounds);
      else {
        this.view.setBounds(bounds);
        this.view.webContents.invalidate();
      }
      return;
    }

    const width = PANEL_WIDTH;
    const bounds = {
      x: Math.max(0, usableWidth - width),
      y: 100,
      width: Math.min(width, usableWidth),
      height: Math.max(0, winHeight - 100),
    };
    if (animate) this.animate(bounds);
    else this.view.setBounds(bounds);
  }

  private broadcastState(): void {
    this.sendEverywhere('chassis:sidebar-state', this.surfaceState());
  }

  /** Re-assert bounds + classes after (re)loads so a reload can never strand a stale shape. */
  private sync(): void {
    this.position();
    this.broadcastState();
  }

  // ---- Collab mode (delegated; the deck only owns the mode coupling) ---------------------

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

  navigate(delta: number): void {
    this.collab.navigate(delta);
  }

  toggleList(anchor?: { x: number; y: number; width: number; height: number }): void {
    this.collab.toggleList(anchor);
  }

  resolveNote(threadId: string): Promise<void> {
    return this.collab.resolveNote(threadId);
  }

  // ---- Providers (wired by index.ts, forwarded to the collab controller) ------------------

  setThreadsProvider(provider: (filter: { url: string }) => CollaborationThread[]): void {
    this.collab.setThreadsProvider(provider);
  }

  setOverlayRefresher(refresh: () => Promise<void> | void): void {
    this.collab.setOverlayRefresher(refresh);
  }

  setResolver(resolve: (id: string) => Promise<unknown> | unknown): void {
    this.collab.setResolver(resolve);
  }

  setEnabledProvider(enabled: () => boolean): void {
    this.collab.setEnabledProvider(enabled);
  }

  isCollabEnabled(): boolean {
    return this.collab.isEnabled();
  }

  setClassListener(listener: (target: CollaborationTarget, added: string[], removed: string[]) => void): void {
    this.collab.setClassListener(listener);
  }

  /** Called by the chassis when a human edits classes on the page. */
  forwardClassEdit(target: CollaborationTarget, added: string[], removed: string[]): void {
    this.collab.forwardClassEdit(target, added, removed);
  }

  // ---- Orb choreography (driven by the deck IPC handlers) --------------------------------

  setOrbEdge(edge: 'left' | 'right'): void {
    const next = edge === 'left' ? 'left' : 'right';
    if (next === this.orbEdge) return;
    this.orbEdge = next;
    if (this.mode === 'collapsed') this.position(true);
    this.broadcastState();
  }

  /** Live drag: forward pointer deltas, clamped inside the content area. */
  dragOrb(delta: { dx: number; dy: number }): void {
    const win = this.deps.window();
    if (this.mode !== 'collapsed') return;
    if (!win || !this.view) return;
    if (this.boundsAnimation) this.boundsAnimation.cancelled = true;
    const [winWidth, winHeight] = win.getContentSize();
    const current = this.view.getBounds();
    const dx = Number(delta?.dx);
    const dy = Number(delta?.dy);
    const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));
    // The view is chip+padding; keep the visible chip inside the page area.
    const maxX = Math.max(0, winWidth - PAGE_SCROLLBAR_GUTTER - DECK_ORB_VIEW + DECK_ORB_VIEW_PAD - DECK_ORB_MARGIN);
    const x = clamp(
      Number.isFinite(dx) ? current.x + dx : current.x,
      0,
      maxX,
    );
    const y = clamp(
      Number.isFinite(dy) ? current.y + dy : current.y,
      100,
      Math.max(100, winHeight - DECK_ORB_VIEW + DECK_ORB_VIEW_PAD - DECK_ORB_MARGIN),
    );
    this.view.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: DECK_ORB_VIEW,
      height: DECK_ORB_VIEW,
    });
  }

  /** Drop: dock to the nearest vertical edge with the standard margin. */
  endOrbDrag(): void {
    const win = this.deps.window();
    if (this.mode !== 'collapsed') return;
    if (!win || !this.view) return;
    const [winWidth] = win.getContentSize();
    const current = this.view.getBounds();
    this.orbEdge = current.x + current.width / 2 < winWidth / 2 ? 'left' : 'right';
    this.position(true);
    this.broadcastState();
  }
}
