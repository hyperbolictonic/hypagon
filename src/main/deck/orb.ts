/**
 * The collapsed deck's orb chip: which corner it docks to, the live drag and the
 * drop.
 *
 * Why a module: the chip is the one deck shape a human moves by hand. The drag
 * is a clamped bounds step, the drop picks the nearest edge, and both only apply
 * while the deck is collapsed — three rules that belong together.
 */
import type { BrowserWindow, WebContentsView } from 'electron';
import type { DeckEdge, DeckMode } from './bounds.js';
import { nearestEdge, orbDragBounds } from './bounds.js';
import type { DeckPanel } from './panel.js';

/** When to use: constructing the controller — the panel and the broadcast hook. */
export interface DeckOrbDeps {
  window: () => BrowserWindow | null;
  panel: () => DeckPanel;
  mode: () => DeckMode;
  /** Re-assert the bounds after a drop (the chip changes size in collab mode). */
  reposition: (animate: boolean) => void;
  /** Broadcast the surface state after an edge change. */
  onChanged: () => void;
}

/** The live chip shape a drag or drop needs, or null when it is not on screen. */
interface ChipGeometry {
  view: WebContentsView;
  winWidth: number;
  winHeight: number;
}

/** When to use: `DeckController` — own the collapsed chip's edge and drag. */
export class DeckOrb {
  private edge: DeckEdge = 'right';

  constructor(private readonly deps: DeckOrbDeps) {}

  getEdge(): DeckEdge {
    return this.edge;
  }

  setEdge(edge: 'left' | 'right'): void {
    const next: DeckEdge = edge === 'left' ? 'left' : 'right';
    if (next === this.edge) return;
    this.edge = next;
    if (this.deps.mode() === 'collapsed') this.deps.reposition(true);
    this.deps.onChanged();
  }

  /** Live drag: forward pointer deltas, clamped inside the content area. */
  drag(delta: { dx: number; dy: number }): void {
    const chip = this.chip();
    if (!chip) return;
    this.deps.panel().setBounds(orbDragBounds(chip.view.getBounds(), delta, chip.winWidth, chip.winHeight));
  }

  /** Drop: dock to the nearest vertical edge with the standard margin. */
  endDrag(): void {
    const chip = this.chip();
    if (!chip) return;
    this.edge = nearestEdge(chip.view.getBounds(), chip.winWidth);
    this.deps.reposition(true);
    this.deps.onChanged();
  }

  /** The chip's live view and content size, or null unless it is the active shape. */
  private chip(): ChipGeometry | null {
    if (this.deps.mode() !== 'collapsed') return null;
    const win = this.deps.window();
    const view = this.deps.panel().getView();
    if (!win || !view) return null;
    const [winWidth, winHeight] = win.getContentSize();
    return { view, winWidth, winHeight };
  }
}
