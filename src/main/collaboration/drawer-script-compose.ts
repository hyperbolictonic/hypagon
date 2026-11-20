/**
 * Second phase of the note-drawer page script: positioning against the picked element, the
 * collapsed/free states, and submit.
 *
 * When to use: composed by collaborationNoteDrawerScript; never evaluated on its own.
 */
export const DRAWER_COMPOSE = `    const position = () => {
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
      event.preventDefault();
    });
    head.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      setFree(true);
      const width = card.offsetWidth;
      const height = card.offsetHeight;
      const docWidth = Math.max(innerWidth, document.documentElement.scrollWidth);
      const docHeight = Math.max(innerHeight, document.documentElement.scrollHeight);
      const left = clamp(event.clientX - dragOffsetX + scrollX, 8, Math.max(8, docWidth - width - 8));
      const top = clamp(event.clientY - dragOffsetY + scrollY, 8, Math.max(8, docHeight - height - 8));
      drawer.style.left = Math.round(left) + 'px';
      drawer.style.top = Math.round(top) + 'px';
      arrow.className = 'hb-arrow';
    });
`;
