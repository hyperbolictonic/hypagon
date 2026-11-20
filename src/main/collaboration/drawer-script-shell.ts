/**
 * First phase of the note-drawer page script: the injected styles, the console prefixes and the
 * small helpers that mount the drawer next to the picked element.
 *
 * When to use: composed by collaborationNoteDrawerScript; never evaluated on its own.
 */
import { COLLAB_CSS } from './overlay-css.js';
import {
  COLLABORATION_CLASS_PREFIX,
  COLLABORATION_NOTE_PREFIX,
  COLLABORATION_RESOLVE_PREFIX,
} from './overlay-prefixes.js';

/** When to use: composed by collaborationNoteDrawerScript — the mount and placement phase. */
export const DRAWER_SHELL = `(() => {
  const CSS_TEXT = ${JSON.stringify(COLLAB_CSS)};
  const NOTE_PREFIX = ${JSON.stringify(COLLABORATION_NOTE_PREFIX)};
  const CLASS_PREFIX = ${JSON.stringify(COLLABORATION_CLASS_PREFIX)};
  const RESOLVE_PREFIX = ${JSON.stringify(COLLABORATION_RESOLVE_PREFIX)};
  const ICON = {
    minus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    anchor: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>'
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const ensureStyle = () => {
    let style = document.getElementById('__kuang_collab_style');
    if (!style) {
      style = document.createElement('style');
      style.id = '__kuang_collab_style';
      style.textContent = CSS_TEXT;
      (document.head || document.documentElement).appendChild(style);
    }
  };
  window.__hbCollabOpenNoteDrawer = function (el, target, options) {
    const rightInset = options && Number.isFinite(options.rightInset) ? Math.max(0, options.rightInset) : 0;
    ensureStyle();
    const previousDrawer = document.getElementById('__kuang_collab_drawer');
    if (previousDrawer) previousDrawer.remove();
    const previousSelection = document.getElementById('__kuang_collab_selection');
    if (previousSelection) previousSelection.remove();

    const shortSelector = (target && target.selector ? target.selector.split(' > ').pop() : '') || (target && target.role) || 'element';
    const keep = document.createElement('div');
    keep.id = '__kuang_collab_selection';
    const tag = document.createElement('div');
    tag.className = 'hb-tag';
    tag.textContent = shortSelector.length > 30 ? shortSelector.slice(0, 29) + '\\u2026' : shortSelector;
    tag.title = (target && target.selector) || '';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'hb-add';
    add.title = 'Add note';
    add.setAttribute('aria-label', 'Add note');
    add.innerHTML = ICON.plus;
    keep.append(tag, add);
    document.documentElement.appendChild(keep);

    const drawer = document.createElement('div');
    drawer.id = '__kuang_collab_drawer';
    const card = document.createElement('div');
    card.className = 'hb-card';
    const head = document.createElement('div');
    head.className = 'hb-head';
    const dot = document.createElement('span');
    dot.className = 'hb-dot';
    const title = document.createElement('span');
    title.className = 'hb-title';
    title.textContent = 'Add note';
    const chip = document.createElement('span');
    chip.className = 'hb-chip';
    chip.textContent = shortSelector.length > 30 ? shortSelector.slice(0, 29) + '\\u2026' : shortSelector;
    chip.title = (target && target.selector) || '';
    const anchor = document.createElement('button');
    anchor.type = 'button';
    anchor.className = 'hb-icon';
    anchor.title = 'Re-anchor to element';
    anchor.setAttribute('aria-label', 'Re-anchor to element');
    anchor.innerHTML = ICON.anchor;
    anchor.hidden = true;
    const minimize = document.createElement('button');
    minimize.type = 'button';
    minimize.className = 'hb-icon';
    minimize.title = 'Minimize note';
    minimize.setAttribute('aria-label', 'Minimize note');
    minimize.innerHTML = ICON.minus;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'hb-icon';
    close.title = 'Cancel';
    close.setAttribute('aria-label', 'Cancel');
    close.innerHTML = ICON.close;
    head.append(dot, title, chip, anchor, minimize, close);

    const body = document.createElement('div');
    body.className = 'hb-body';
    const note = document.createElement('textarea');
    note.className = 'hb-note';
    note.placeholder = 'What should the agent know about this element?';
    const tags = document.createElement('input');
    tags.className = 'hb-tags';
    tags.placeholder = 'Tags - comma separated';
    body.append(note, tags);

    const foot = document.createElement('div');
    foot.className = 'hb-foot';
    const hint = document.createElement('span');
    hint.className = 'hb-hint';
    hint.textContent = 'Ctrl + Enter to save';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'hb-btn hb-ghost';
    cancel.textContent = 'Cancel';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'hb-btn hb-primary';
    saveBtn.textContent = 'Add note';
    foot.append(hint, cancel, saveBtn);

    const arrow = document.createElement('div');
    arrow.className = 'hb-arrow';
    card.append(head, body, foot, arrow);
    drawer.append(card);
    document.documentElement.appendChild(drawer);

    let collapsed = false;
    let free = false;
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let saving = false;
    let saveHandled = false;
    let saveTimer = 0;
    const SAVED_EVENT = '__hb_collab_refreshed';

`;
