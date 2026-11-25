/** When to use: composing the note-composer script — the DOM, drag and minimising half. */
export const NOTE_DRAWER_BODY_A = `  const ICON = {
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

    const position = () => {
      const rect = el.getBoundingClientRect();
      const offsetX = scrollX;
      const offsetY = scrollY;
      const vw = Math.max(0, innerWidth - rightInset);
      const vh = innerHeight;
      const margin = 12;
      const gap = 12;
      keep.style.left = rect.left + offsetX + 'px';
      keep.style.top = rect.top + offsetY + 'px';
      keep.style.width = rect.width + 'px';
      keep.style.height = rect.height + 'px';
      tag.style.top = rect.top > 20 ? '-10px' : '2px';
      const size = 24;
      let addLeft = rect.right + 8;
      if (addLeft + size > vw - 8) addLeft = rect.right - size - 6;
      if (addLeft < 8) addLeft = clamp(rect.left, 8, Math.max(8, vw - size - 8));
      const addTop = rect.top > 34 ? rect.top - size - 6 : rect.top + 6;
      add.style.left = Math.round(addLeft - rect.left) + 'px';
      add.style.top = Math.round(addTop - rect.top) + 'px';
      if (free) return;
      const width = card.offsetWidth || 320;
      const height = card.offsetHeight || 240;
      let left;
      let top;
      let side = 'right';
      if (collapsed) {
        if (rect.right + gap + width <= vw - margin) { left = rect.right + gap; top = rect.top; }
        else if (rect.left - gap - width >= margin) { left = rect.left - gap - width; top = rect.top; }
        else if (rect.bottom + gap + height <= vh - margin) { left = rect.right - width; top = rect.bottom + gap; }
        else { left = rect.right - width; top = rect.top - height - gap; }
        side = 'none';
      } else if (rect.right + gap + width <= vw - margin) {
        side = 'right';
        left = rect.right + gap;
        top = rect.top + rect.height / 2 - height / 2;
      } else if (rect.left - gap - width >= margin) {
        side = 'left';
        left = rect.left - gap - width;
        top = rect.top + rect.height / 2 - height / 2;
      } else if (rect.bottom + gap + height <= vh - margin) {
        side = 'below';
        left = rect.left;
        top = rect.bottom + gap;
      } else if (rect.top - gap - height >= margin) {
        side = 'above';
        left = rect.left;
        top = rect.top - gap - height;
      } else {
        // The element fills the viewport: float the composer in the corner.
        left = vw - width - margin;
        top = vh - height - margin;
        side = 'none';
      }
      left = clamp(left, margin, Math.max(margin, vw - width - margin));
      top = clamp(top, margin, Math.max(margin, vh - height - margin));
      drawer.style.left = Math.round(left + offsetX) + 'px';
      drawer.style.top = Math.round(top + offsetY) + 'px';
      if (side === 'none') {
        arrow.className = 'hb-arrow';
        return;
      }
      if (side === 'right' || side === 'left') {
        arrow.className = 'hb-arrow ' + (side === 'right' ? 'is-left' : 'is-right');
        arrow.style.top = clamp(rect.top + rect.height / 2 - top - 5, 14, Math.max(14, height - 20)) + 'px';
        arrow.style.left = '';
        arrow.style.right = '';
      } else {
        arrow.className = 'hb-arrow ' + (side === 'below' ? 'is-up' : 'is-down');
        arrow.style.left = clamp(rect.left + rect.width / 2 - left - 5, 14, Math.max(14, width - 20)) + 'px';
        arrow.style.top = '';
      }
    };

    const setCollapsed = (value) => {
      collapsed = value;
      card.classList.toggle('is-collapsed', collapsed);
      minimize.innerHTML = collapsed ? ICON.plus : ICON.minus;
      minimize.title = collapsed ? 'Expand note' : 'Minimize note';
      minimize.setAttribute('aria-label', minimize.title);
      title.textContent = collapsed ? 'Note' : 'Add note';
      position();
    };

    const setFree = (value) => {
      free = value;
      anchor.hidden = !value;
    };

    const remove = () => {
      keep.remove();
      drawer.remove();
      if (window.__hbCollabClearElementBar) window.__hbCollabClearElementBar();
      window.removeEventListener('resize', position);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener(SAVED_EVENT, onSavedEvent, true);
      clearTimeout(saveTimer);
      delete window.__kuangCollabSelectionCancel;
    };

    const submit = () => {
      const text = note.value.trim();
      if (!text) { note.focus(); return; }
      if (saving) return;
      saveHandled = false;
      saving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      hint.textContent = 'Saving your note…';
      hint.classList.remove('text-error');
      document.addEventListener(SAVED_EVENT, onSavedEvent, true);
      saveTimer = setTimeout(() => {
        if (saveHandled) return;
        saving = false;
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add note';
        hint.textContent = 'Save not confirmed — check the gateway and try again.';
        hint.classList.add('text-error');
      }, 4000);
      console.log(NOTE_PREFIX + JSON.stringify({
        target,
        text,
        tags: tags.value.split(',').map((tag) => tag.trim()).filter(Boolean),
      }));
    };

    const onSavedEvent = () => {
      if (!saving) return;
      saveHandled = true;
      remove();
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        remove();
        return;
      }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        submit();
      }
    };
    document.addEventListener('keydown', onKey, true);

    head.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target && event.target.closest('button')) return;
      if (collapsed) { setCollapsed(false); return; }
      dragging = true;
      const box = drawer.getBoundingClientRect();
      dragOffsetX = event.clientX - box.left;
      dragOffsetY = event.clientY - box.top;
      head.style.cursor = 'grabbing';
      try { head.setPointerCapture(event.pointerId); } catch {}
`;
