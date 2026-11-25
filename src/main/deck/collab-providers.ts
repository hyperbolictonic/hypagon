/**
 * The hooks the collaboration service and page overlay provide to the deck.
 *
 * Why a module: these five callbacks used to be fields with six setter methods
 * on `CollabController`. They are plain wiring points, so they are public fields
 * here and the controller keeps only the behaviour that reacts to them.
 */
import type { CollaborationTarget, CollaborationThread } from '../../shared/collaboration.js';

/** When to use: `CollabController` — the deck's collab wiring points. */
export class CollabProviders {
  /** The collab thread source; wired by the boot to the collaboration service. */
  threads?: (filter: { url: string }) => CollaborationThread[];
  /** Re-render the page overlay (after a mutation or before showing a thread). */
  overlayRefresher?: () => Promise<void> | void;
  /** Resolve one thread from the deck's list or the in-page card. */
  resolver?: (id: string) => Promise<unknown> | unknown;
  /** Human class-list edits, forwarded to the collaboration service. */
  classListener?: (target: CollaborationTarget, added: string[], removed: string[]) => void;
  /** The experimental gate; wired to the persisted flag. */
  gate: () => boolean = () => true;

  /** When to use: the note cycle — the same thread set the page overlay displays. */
  openThreads(url: string): CollaborationThread[] {
    try {
      return (this.threads?.({ url }) ?? []).filter((thread) => thread.status !== 'resolved');
    } catch {
      return [];
    }
  }

  /** When to use: the chassis after a human edits classes on the page. */
  forwardClassEdit(target: CollaborationTarget, added: string[], removed: string[]): void {
    this.classListener?.(target, added, removed);
  }
}
