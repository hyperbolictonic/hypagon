/**
 * The in-page collaboration surfaces: the note drawer, the element picker and the thread overlay.
 *
 * Each script is built from phase modules (see `note-drawer.ts` and its fragments); this module
 * is the stable entry point the chassis imports, plus the console prefixes all three share.
 */

export {
  COLLABORATION_CLASS_PREFIX,
  COLLABORATION_EXIT_PREFIX,
  COLLABORATION_NOTE_PREFIX,
  COLLABORATION_RESOLVE_PREFIX,
} from './overlay-prefixes.js';
export { collaborationNoteDrawerScript } from './note-drawer.js';
export { collaborationPickerScript, type CollaborationPickerOptions } from './picker-script.js';
export { collaborationOverlayScript } from './overlay-script.js';
