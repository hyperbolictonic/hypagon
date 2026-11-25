/**
 * Collaboration overlay assets.
 *
 * The injected page scripts are large and depend on the page, not on Kuang, so
 * their static text lives in `assets/` as plain templates. This module keeps the
 * wire prefixes and the small heads that inject per-call values (CSS, payload,
 * right inset) and composes each script.
 */
import type { CollaborationThread } from '../../shared/collaboration.js';
import { COLLAB_CSS } from './assets/css.js';
import { NOTE_DRAWER_BODY_A } from './assets/note-drawer-a.js';
import { NOTE_DRAWER_BODY_B } from './assets/note-drawer-b.js';
import { PICKER_BODY } from './assets/picker-body.js';
import { OVERLAY_BODY_A, OVERLAY_BODY_C } from './assets/overlay-body.js';

/** When to use: parsing or emitting a note from the in-page collaboration drawer. */
export const COLLABORATION_NOTE_PREFIX = '__KUANG_COLLAB_NOTE__:';
/** Human class-list edits on a selected element (the LLM reads these). */
export const COLLABORATION_CLASS_PREFIX = '__KUANG_COLLAB_CLASS__:';
/** Resolve a thread from its in-page annotation card while in collab mode. */
export const COLLABORATION_RESOLVE_PREFIX = '__KUANG_COLLAB_RESOLVE__:';
/** Escape from collab mode while the page itself owns keyboard focus. */
export const COLLABORATION_EXIT_PREFIX = '__KUANG_COLLAB_EXIT__';

/** The drawer's preamble: shared CSS and the console prefixes it reports with. */
function noteDrawerHead(): string {
  return `(() => {
  const CSS_TEXT = ${JSON.stringify(COLLAB_CSS)};
  const NOTE_PREFIX = ${JSON.stringify(COLLABORATION_NOTE_PREFIX)};
  const CLASS_PREFIX = ${JSON.stringify(COLLABORATION_CLASS_PREFIX)};
  const RESOLVE_PREFIX = ${JSON.stringify(COLLABORATION_RESOLVE_PREFIX)};
`;
}

/**
 * Anchored note composer. The drawer is mounted next to the picked element,
 * follows it while the page scrolls, can be minimised to a compact pill and can
 * be dragged out of the way. Exposed on `window` so the picker and the tests
 * share one implementation.
 */
export function collaborationNoteDrawerScript(): string {
  return noteDrawerHead() + NOTE_DRAWER_BODY_A + NOTE_DRAWER_BODY_B;
}

/** Human element picker. The click is reported through the existing console channel. */
export interface CollaborationPickerOptions {
  /** Page width (from the right edge) covered by the floating deck panel. */
  rightInset?: number;
}

/** The picker preamble: the drawer script and the resolved right inset. */
function pickerHead(rightInset: number): string {
  return `new Promise((resolve) => {
    ${collaborationNoteDrawerScript()}
    const RIGHT_INSET = ${JSON.stringify(rightInset)};
`;
}

/** When to use: entering collaboration mode — inject the element picker and its annotation drawer into the page. */
export function collaborationPickerScript(options: CollaborationPickerOptions = {}): string {
  const rightInset = typeof options.rightInset === 'number' && Number.isFinite(options.rightInset)
    ? Math.max(0, options.rightInset)
    : 0;
  return pickerHead(rightInset) + PICKER_BODY;
}

interface OverlayPayload {
  id: string;
  status: string;
  text: string;
  humanOnly: boolean;
  choices: string[];
  target: unknown;
}

/** The overlay preamble: CSS, the thread payload, the right inset and the resolve prefix. */
function overlayHead(payload: OverlayPayload[], rightInset: number): string {
  return `(() => {
    const layerId = '__kuang_collaboration_layer';
    document.dispatchEvent(new CustomEvent('__hb_collab_refreshed'));
    const old = document.getElementById(layerId);
    if (old) old.remove();
    const style = document.getElementById('__kuang_collab_style');
    if (!style) {
      const injected = document.createElement('style');
      injected.id = '__kuang_collab_style';
      injected.textContent = ${JSON.stringify(COLLAB_CSS)};
      (document.head || document.documentElement).appendChild(injected);
    }
    const threads = ${JSON.stringify(payload)};
    const RIGHT_INSET = ${JSON.stringify(rightInset)};
    const RESOLVE_PREFIX = ${JSON.stringify(COLLABORATION_RESOLVE_PREFIX)};
`;
}

/**
 * Pure in-page projection for collaboration threads. The overlay is read-only in
 * Phase 1; Phase 2 adds human selection/reply controls.
 */
export function collaborationOverlayScript(
  threads: CollaborationThread[],
  options: { rightInset?: number } = {},
): string {
  const rightInset = typeof options.rightInset === 'number' && Number.isFinite(options.rightInset)
    ? Math.max(0, options.rightInset)
    : 0;
  const payload = threads.map((thread) => ({
    id: thread.id,
    status: thread.status,
    text: thread.messages.find((message) => message.author === 'agent')?.text
      || thread.intent
      || thread.messages[0]?.text
      || '',
    humanOnly: !thread.messages.some((message) => message.author === 'agent'),
    choices: thread.messages.find((message) => message.kind === 'question')?.choices || [],
    target: thread.target,
  }));
  return overlayHead(payload, rightInset) + OVERLAY_BODY_A + `        console.log(${JSON.stringify(COLLABORATION_EXIT_PREFIX)});
` + OVERLAY_BODY_C;
}
