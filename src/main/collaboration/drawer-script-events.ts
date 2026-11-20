/**
     * Third phase of the note-drawer page script: drag and keyboard handling, saved-event
     * reporting, and the console messages main listens for.
     *
     * When to use: composed by collaborationNoteDrawerScript; never evaluated on its own.
     */
export const DRAWER_EVENTS = `    const endDrag = (event) => {
      if (!dragging) return;
      dragging = false;
      head.style.cursor = '';
      try { head.releasePointerCapture(event.pointerId); } catch {}
    };
    head.addEventListener('pointerup', endDrag);
    head.addEventListener('pointercancel', endDrag);

    minimize.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCollapsed(!collapsed);
    });
    close.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      remove();
    });
    cancel.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      remove();
    });
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setFree(false);
      position();
    });
    saveBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      submit();
    });
    add.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (collapsed) setCollapsed(false);
      note.focus();
    });
    note.addEventListener('input', () => {
      note.style.height = 'auto';
      note.style.height = Math.min(240, Math.max(88, note.scrollHeight)) + 'px';
    });
    drawer.addEventListener('mousedown', (event) => event.stopPropagation());
    drawer.addEventListener('pointerdown', (event) => event.stopPropagation());
    drawer.addEventListener('click', (event) => event.stopPropagation());
    drawer.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') event.stopPropagation();
    });

    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    window.__kuangCollabSelectionCancel = remove;
    position();
    note.focus();
    return { remove, position, setCollapsed, card, drawer };
  };

  /**
   * Element collab toolbar: pins to the freshly selected element with a
   * persistent amber outline. Pen = compose a note; CSS = edit the element
   * class list (human intent the agent can read); DONE = finish working on
   * the element. Survives page scrolls; Escape/another selection closes it.
   */
  window.__hbCollabClearElementBar = function () {
    const bar = document.getElementById('__kuang_collab_elementbar');
    if (bar) bar.remove();
    const pop = document.getElementById('__kuang_collab_csspop');
    if (pop) pop.remove();
    document.querySelectorAll('.hb-el-selected').forEach(function (node) {
      node.classList.remove('hb-el-selected');
    });
    if (window.__hbCollabElementEscapeHandler) {
      document.removeEventListener('keydown', window.__hbCollabElementEscapeHandler, true);
      delete window.__hbCollabElementEscapeHandler;
    }
    delete window.__hbCollabSelection;
  };

  window.__hbCollabShowElementToolbar = function (el, target) {
    ensureStyle();
    window.__hbCollabClearElementBar();
    el.classList.add('hb-el-selected');
    window.__hbCollabSelection = { el: el, target: target };
    const bar = document.createElement('div');
    bar.id = '__kuang_collab_elementbar';
    const pen = document.createElement('button');
    pen.className = 'hb-el-btn hb-el-pen';
    pen.textContent = '\\u270E';
    pen.title = 'Attach a note to this element';
    const cssBtn = document.createElement('button');
    cssBtn.className = 'hb-el-btn hb-el-css';
    cssBtn.textContent = 'CSS';
    cssBtn.title = 'Edit this element class list — the agent reads it';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'hb-el-btn hb-el-close';
    closeBtn.textContent = 'DONE';
    closeBtn.title = 'Finish working on this element';
    bar.append(pen, cssBtn, closeBtn);
    document.body.appendChild(bar);
    const place = function () {
      const rect = el.getBoundingClientRect();
      if (!document.getElementById('__kuang_collab_elementbar')) {
        window.removeEventListener('scroll', place, true);
        window.removeEventListener('scroll', place, false);
        return;
      }
      const left = Math.max(6, Math.min(rect.left + rect.width - 6, window.innerWidth - 200));
      const top = rect.top > 48
        ? Math.max(6, rect.top - 44)
        : Math.max(6, Math.min(rect.bottom + 8, window.innerHeight - 42));
      bar.style.left = left + 'px';
      bar.style.top = top + 'px';
    };
    window.addEventListener('scroll', place, true);
    window.__hbCollabElementEscapeHandler = function (event) {
      if (event.key !== 'Escape') return;
      if (window.__hbCollabMode) return;
      if (document.getElementById('__kuang_collab_drawer')) return;
      const cssEditor = document.getElementById('__kuang_collab_csspop');
      if (cssEditor) {
        cssEditor.remove();
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      window.__hbCollabClearElementBar();
    };
    document.addEventListener('keydown', window.__hbCollabElementEscapeHandler, true);
    closeBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      window.__hbCollabClearElementBar();
      delete window.__hbCollabSelection;
    });
    pen.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      bar.remove();
      window.__hbCollabOpenNoteDrawer(el, target);
    });
    cssBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      window.__hbCollabOpenCssEditor(el, target, bar);
    });
    place();
  };

  /**
   * Class-list editor for the selected element. On open it snapshots the
   * current classes; chips reactively toggle real classList membership; SEND
   * reports the delta (+added -removed) over the class channel so the agent
   * can read the human's intent.
   */
  window.__hbCollabOpenCssEditor = function (el, target, bar) {
    const existing = document.getElementById('__kuang_collab_csspop');
    if (existing) {
      existing.remove();
      return;
    }
    const pop = document.createElement('div');
    pop.id = '__kuang_collab_csspop';
    const title = document.createElement('div');
    title.className = 'hb-css-title';
    title.textContent = 'CLASSES — click one to remove';
    const chips = document.createElement('div');
    chips.className = 'hb-css-chips';
    const classNameValue = typeof el.className === 'string'
      ? el.className
      : (el.className && typeof el.className.baseVal === 'string' ? el.className.baseVal : '');
    let current = classNameValue.split(/\\s+/).filter(Boolean);
    const original = current.slice();
    const renderChips = function () {
      chips.replaceChildren();
      if (!current.length) {
        const empty = document.createElement('span');
        empty.textContent = 'no classes';
        empty.style.color = 'rgba(148,163,184,0.55)';
        empty.style.fontSize = '10px';
        chips.append(empty);
        return;
      }
      current.forEach(function (cls) {
        const chip = document.createElement('button');
        chip.className = 'hb-css-chip';
        chip.textContent = cls + ' \\u00D7';
        chip.title = 'Remove ' + cls;
        chip.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (current.indexOf(cls) === -1) return;
          current = current.filter(function (c) { return c !== cls; });
          el.classList.remove(cls);
          renderChips();
        });
        chips.append(chip);
      });
    };
    renderChips();
    const addRow = document.createElement('div');
    addRow.className = 'hb-css-addrow';
    const input = document.createElement('input');
    input.className = 'hb-css-input';
    input.placeholder = 'add class names, space separated';
    const addBtn = document.createElement('button');
    addBtn.className = 'hb-css-add';
    addBtn.textContent = 'ADD';
    const applyToken = function () {
      (input.value || '').trim().split(/\\s+/).filter(Boolean).forEach(function (token) {
        if (current.indexOf(token) === -1) {
          current.push(token);
          el.classList.add(token);
        }
      });
      input.value = '';
      renderChips();
    };
    addBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      applyToken();
    });
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        applyToken();
      }
    });
    addRow.append(input, addBtn);
    const send = document.createElement('button');
    send.className = 'hb-css-send';
    send.textContent = 'SEND CLASSES TO AGENT';
    send.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      const added = current.filter(function (cls) { return original.indexOf(cls) === -1; });
      const removed = original.filter(function (cls) { return current.indexOf(cls) === -1; });
      console.log(CLASS_PREFIX + JSON.stringify({ target: target, added: added, removed: removed }));
      pop.remove();
    });
    pop.append(title, chips, addRow, send);
    document.body.appendChild(pop);
    const barRect = bar.getBoundingClientRect();
    const popWidth = 248;
    const popHeight = Math.min(300, pop.offsetHeight || 220);
    const left = Math.max(6, Math.min(barRect.left, innerWidth - popWidth - 6));
    const below = barRect.bottom + 8;
    const top = below + popHeight <= innerHeight - 6
      ? below
      : Math.max(6, barRect.top - popHeight - 8);
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
  };
})();`;
