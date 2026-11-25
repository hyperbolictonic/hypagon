/**
 * Deck geometry, as pure functions.
 *
 * Why a module: the panel sits over the page, clear of the scrollbar track, and
 * the collapsed deck shrinks to an orb chip (or the collab toolbar pill) anchored
 * to a bottom corner. Both shapes are arithmetic on the content size, so they
 * live here and both the panel and the orb controller read the same numbers.
 */

/** The three panel states the chassis compares. */
export type DeckMode = 'docked' | 'floating' | 'collapsed';

/** Which bottom corner the collapsed chip docks to. */
export type DeckEdge = 'left' | 'right';

/** A rectangle in the window's content coordinates. */
export interface DeckRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Deck geometry. The panel sits over the page, clear of the scrollbar track. */
export const PAGE_SCROLLBAR_GUTTER = 16;
/** Width of the Command Deck HUD (docked and floating). */
export const PANEL_WIDTH = 420;
/** Orb chip size and screen margin. The native view is larger than the visible
 *  chip so hover scale, the pulse ring and the count badge never clip. */
export const DECK_ORB_SIZE = 56;
/** The native view's side, including the padding the chip is drawn inside. */
export const DECK_ORB_VIEW = 84;
/** Half the padding either side of the chip, used to anchor the collapsed view. */
export const DECK_ORB_VIEW_PAD = (DECK_ORB_VIEW - DECK_ORB_SIZE) / 2;
/** Gap between the docked chip and the window edge. */
export const DECK_ORB_MARGIN = 12;
/** Collab-mode toolbar pill: the orb is replaced by this bar. */
export const TOOLBAR_BAR_WIDTH = 248;
/** Sidebar transition duration, shared by the native bounds animation and the panel's CSS reveal. */
export const SIDEBAR_TRANSITION_MS = 240;

/** When to use: the page inset — only a visible floating panel covers the page. */
export function pageInsetOf(overlayVisible: boolean, mode: DeckMode): number {
  if (!overlayVisible) return 0;
  if (mode !== 'floating') return 0;
  return PANEL_WIDTH + PAGE_SCROLLBAR_GUTTER;
}

/**
 * The panel's bounds for the current mode. Collapsed is the orb chip (or the
 * collab pill), anchored to `edge`; docked and floating both fill the right edge
 * below the title bar — the difference is how the page view re-fits, not the
 * panel rect.
 */
export function panelBounds(
  mode: DeckMode,
  collabOpen: boolean,
  edge: DeckEdge,
  winWidth: number,
  winHeight: number,
): DeckRect {
  // Leave the page's right-edge scrollbar out from under the panel. The browsing view spans the
  // full window width (floating panels sit *over* the page), so a panel flush to the right edge
  // covers the scrollbar track completely and the page becomes undraggable by hand.
  const usableWidth = Math.max(0, winWidth - PAGE_SCROLLBAR_GUTTER);

  if (mode === 'collapsed') {
    // The collapsed deck shrinks to a free-floating orb chip anchored at a
    // bottom corner, clear of the scrollbar track. The native view is the
    // chip plus padding (hover scale, pulse ring, count badge must not clip).
    // In collab mode the orb is replaced by a horizontal toolbar pill with
    // its own sized view, same corner.
    const orbView = { width: DECK_ORB_VIEW, height: DECK_ORB_VIEW };
    const pillView = { width: TOOLBAR_BAR_WIDTH + 2 * DECK_ORB_VIEW_PAD, height: DECK_ORB_VIEW };
    const viewSize = collabOpen ? pillView : orbView;
    const anchorX =
      edge === 'left'
        ? Math.max(0, DECK_ORB_MARGIN - DECK_ORB_VIEW_PAD)
        : usableWidth - DECK_ORB_MARGIN + DECK_ORB_VIEW_PAD;
    return {
      x: Math.max(0, anchorX - viewSize.width),
      y: Math.max(0, winHeight - DECK_ORB_MARGIN + DECK_ORB_VIEW_PAD - viewSize.height),
      width: viewSize.width,
      height: viewSize.height,
    };
  }

  const width = PANEL_WIDTH;
  return {
    x: Math.max(0, usableWidth - width),
    y: 100,
    width: Math.min(width, usableWidth),
    height: Math.max(0, winHeight - 100),
  };
}

/** One live drag step: forward the pointer delta, clamped inside the content area. */
export function orbDragBounds(
  current: DeckRect,
  delta: { dx: number; dy: number },
  winWidth: number,
  winHeight: number,
): DeckRect {
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));
  const dx = Number(delta?.dx);
  const dy = Number(delta?.dy);
  // The view is chip+padding; keep the visible chip inside the page area.
  const maxX = Math.max(0, winWidth - PAGE_SCROLLBAR_GUTTER - DECK_ORB_VIEW + DECK_ORB_VIEW_PAD - DECK_ORB_MARGIN);
  const x = clamp(Number.isFinite(dx) ? current.x + dx : current.x, 0, maxX);
  const y = clamp(
    Number.isFinite(dy) ? current.y + dy : current.y,
    100,
    Math.max(100, winHeight - DECK_ORB_VIEW + DECK_ORB_VIEW_PAD - DECK_ORB_MARGIN),
  );
  return { x: Math.round(x), y: Math.round(y), width: DECK_ORB_VIEW, height: DECK_ORB_VIEW };
}

/** Drop: dock to the nearest vertical edge. */
export function nearestEdge(current: DeckRect, winWidth: number): DeckEdge {
  return current.x + current.width / 2 < winWidth / 2 ? 'left' : 'right';
}
