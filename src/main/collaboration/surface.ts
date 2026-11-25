/**
 * Collaboration surface.
 *
 * Owns the page-side collaboration channel: the element picker, its cancel, and
 * the console signals the overlay posts back (note, resolve, class edit, exit).
 * The deck renders the overlay; this surface parses its signals and routes them.
 */
import type { WebContents } from 'electron';
import type { CollaborationTarget } from '../../shared/collaboration.js';
import {
  COLLABORATION_CLASS_PREFIX,
  COLLABORATION_EXIT_PREFIX,
  COLLABORATION_NOTE_PREFIX,
  COLLABORATION_RESOLVE_PREFIX,
  collaborationPickerScript,
} from './overlay.js';

/** A note the page overlay posted for the collaboration store. */
export interface CollaborationNote {
  target: CollaborationTarget;
  text: string;
  tags: string[];
}

/** Dependencies the collaboration surface needs from the deck and the tab. */
export interface CollaborationSurfaceDeps {
  activeWebContents(): WebContents;
  /** The deck's content inset, so the picker does not sit under the panel. */
  pageInset(): number;
  setCollabMode(open: boolean): void;
  resolveNote(id: string): Promise<void> | void;
  forwardClassEdit(target: CollaborationTarget, added: string[], removed: string[]): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** The element picker and the page overlay signal channel. */
export class CollaborationSurface {
  private onNote?: (note: CollaborationNote) => void;
  private readonly deps: CollaborationSurfaceDeps;

  constructor(deps: CollaborationSurfaceDeps) {
    this.deps = deps;
  }

  setNoteHandler(callback: (note: CollaborationNote) => void): void {
    this.onNote = callback;
  }

  /** Start the human element picker and resolve with its selected target. */
  async pickTarget(): Promise<CollaborationTarget | null> {
    const wc = this.deps.activeWebContents();
    return await wc
      .executeJavaScript(collaborationPickerScript({ rightInset: this.deps.pageInset() }))
      .catch(() => null);
  }

  async stopSelection(): Promise<void> {
    try {
      const wc = this.deps.activeWebContents();
      await wc.executeJavaScript(`
        (() => {
          if (typeof window.__kuangCollabPickerCancel === 'function') window.__kuangCollabPickerCancel();
          if (typeof window.__kuangCollabSelectionCancel === 'function') window.__kuangCollabSelectionCancel();
          const el = document.getElementById('__kuang_collab_picker');
          if (el) el.remove();
          const selected = document.getElementById('__kuang_collab_selection');
          if (selected) selected.remove();
          window.__kuangCollabPicking = false;
        })()
      `);
    } catch {}
  }

  /** One console line from the page overlay; ordinary logs are ignored. */
  handleSignal(message: string): void {
    if (message === COLLABORATION_EXIT_PREFIX) {
      this.deps.setCollabMode(false);
      return;
    }
    if (message.startsWith(COLLABORATION_RESOLVE_PREFIX)) {
      try {
        const payload = JSON.parse(message.slice(COLLABORATION_RESOLVE_PREFIX.length));
        if (typeof payload?.id === 'string') void this.deps.resolveNote(payload.id);
      } catch {
        this.deps.log('warn', 'Collaboration note resolve signal was invalid.');
      }
      return;
    }
    if (message.startsWith(COLLABORATION_NOTE_PREFIX)) {
      try {
        const note = JSON.parse(message.slice(COLLABORATION_NOTE_PREFIX.length));
        if (note?.target && typeof note.text === 'string') {
          this.onNote?.({
            target: note.target,
            text: note.text,
            tags: Array.isArray(note.tags) ? note.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
          });
        }
      } catch {}
      return;
    }
    if (message.startsWith(COLLABORATION_CLASS_PREFIX)) {
      try {
        const edit = JSON.parse(message.slice(COLLABORATION_CLASS_PREFIX.length));
        if (edit?.target) {
          this.deps.forwardClassEdit(
            edit.target,
            Array.isArray(edit.added) ? edit.added.map(String) : [],
            Array.isArray(edit.removed) ? edit.removed.map(String) : [],
          );
        }
      } catch {}
    }
  }
}
