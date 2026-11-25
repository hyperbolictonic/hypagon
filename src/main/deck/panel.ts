/**
 * The deck's native panel view: creation, bounds, painting and the load-time
 * re-assert.
 *
 * Why a module: the view is a transparent `WebContentsView` that cannot be moved
 * by CSS. The main process steps its bounds on the same easing the panel's DOM
 * reveal uses, re-asserts both after a reload, and hides it by zeroing the rect.
 * That is one job, and the controller only asks for it.
 */
import { WebContentsView, type BrowserWindow } from 'electron';
import type { DeckMode, DeckRect } from './bounds.js';
import { pageInsetOf, panelBounds, SIDEBAR_TRANSITION_MS } from './bounds.js';

/** When to use: constructing the controller — the window, loader and mode readers. */
export interface DeckPanelDeps {
  window: () => BrowserWindow | null;
  /** Load the panel renderer (dev server or packaged file) into a fresh view. */
  loadPanel: (view: WebContentsView) => void;
  /** Preload bundle for the shared menu popup. */
  popupPreloadPath: string;
  mode: () => DeckMode;
  collabOpen: () => boolean;
  edge: () => 'left' | 'right';
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  /** Fired after the panel (re)loads, before the state sync. */
  onLoaded: () => void;
}

/** Step the view's bounds on the panel's easing; a new call cancels the old run. */
function animateBounds(
  view: WebContentsView | null,
  animation: { current: { cancelled: boolean } | null },
  target: DeckRect,
): void {
  if (!view) return;
  if (animation.current) animation.current.cancelled = true;
  const token = { cancelled: false };
  animation.current = token;

  const start = view.getBounds();
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const dw = target.width - start.width;
  const dh = target.height - start.height;
  if (!dx && !dy && !dw && !dh) return;

  const startedAt = Date.now();
  const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

  const step = (): void => {
    if (token.cancelled || !view.webContents) return;
    const progress = Math.min(1, (Date.now() - startedAt) / SIDEBAR_TRANSITION_MS);
    const eased = easeOutCubic(progress);
    view.setBounds({
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
      view.webContents.invalidate();
    }
  };
  step();
}

/** When to use: `DeckController` — own the panel view and its bounds. */
export class DeckPanel {
  private view: WebContentsView | null = null;
  private overlayVisible = true;
  private readonly animation: { current: { cancelled: boolean } | null } = { current: null };

  constructor(private readonly deps: DeckPanelDeps) {}

  getView(): WebContentsView | null {
    return this.view;
  }

  /** When to use: the page inset — only a visible floating panel covers the page. */
  pageInset(): number {
    return pageInsetOf(this.overlayVisible, this.deps.mode());
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
      this.deps.onLoaded();
    });

    this.position();
  }

  /** Send to the panel view only (used by the chassis for boot-time state). */
  send(channel: string, payload: unknown): void {
    const wc = this.view?.webContents;
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
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

  /** When to use: the orb drag — a live setBounds that cancels any running transition. */
  setBounds(bounds: DeckRect): void {
    if (this.animation.current) this.animation.current.cancelled = true;
    this.view?.setBounds(bounds);
  }

  /** When to use: mode changes, resizes and visibility — place the view. */
  position(animate = false): void {
    const win = this.deps.window();
    if (!win || !this.view) return;
    // A snap (window resize, visibility change) invalidates a running
    // transition; the direct setBounds below must be its final word.
    if (this.animation.current) this.animation.current.cancelled = true;
    if (!this.overlayVisible) {
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }

    // Child-view bounds are relative to the content area (excluding the title
    // bar and menu), so read the content size instead of the outer size.
    const [winWidth, winHeight] = win.getContentSize();
    const bounds = panelBounds(this.deps.mode(), this.deps.collabOpen(), this.deps.edge(), winWidth, winHeight);

    if (animate) {
      animateBounds(this.view, this.animation, bounds);
      return;
    }
    this.view.setBounds(bounds);
    // The collapsed chip is drawn over whatever the page left behind, so a snap
    // repaints it; the docked panel is opaque enough to skip the extra paint.
    if (this.deps.mode() === 'collapsed') this.view.webContents.invalidate();
  }
}
