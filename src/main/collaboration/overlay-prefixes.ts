/**
 * The console prefixes the in-page collaboration surfaces use to report back to main.
 *
 * They are one contract shared by the drawer, the picker and the thread overlay, so they live
 * in one module rather than being restated in each script builder.
 */

/** When to use: parsing page notes the collaboration overlay reports over the console. */
export const COLLABORATION_NOTE_PREFIX = '__KUANG_COLLAB_NOTE__:';
/** Human class-list edits on a selected element (the LLM reads these). */
export const COLLABORATION_CLASS_PREFIX = '__KUANG_COLLAB_CLASS__:';
/** Resolve a thread from its in-page annotation card while in collab mode. */
export const COLLABORATION_RESOLVE_PREFIX = '__KUANG_COLLAB_RESOLVE__:';
/** Escape from collab mode while the page itself owns keyboard focus. */
export const COLLABORATION_EXIT_PREFIX = '__KUANG_COLLAB_EXIT__';
