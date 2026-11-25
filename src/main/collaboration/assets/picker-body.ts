/** When to use: composing the picker script after its drawer/inset head. */
export const PICKER_BODY = `    if (window.__hbCollabClearElementBar) window.__hbCollabClearElementBar();
    // Visible status chip so "the picker is armed" is never a mystery.
    const chip = document.createElement('div');
    chip.textContent = 'ADD NOTE — click an element to pin the note · Esc to cancel';
    Object.assign(chip.style, {
      position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '2147483647', padding: '8px 14px', borderRadius: '999px',
      border: '1px solid rgba(245,158,11,0.55)',
      background: 'rgba(245,158,11,0.14)',
      color: '#fbbf24', font: '600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      letterSpacing: '0.06em', boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      pointerEvents: 'none',
    });
    chip.id = '__kuang_collab_pick_chip';
    document.body.appendChild(chip);
    const layerId = '__kuang_collab_picker';
    const old = document.getElementById(layerId);
    if (old) old.remove();
    const oldSelection = document.getElementById('__kuang_collab_selection');
    if (oldSelection) oldSelection.remove();
    const oldDrawer = document.getElementById('__kuang_collab_drawer');
    if (oldDrawer) oldDrawer.remove();
    const layer = document.createElement('div');
    layer.id = layerId;
    Object.assign(layer.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647',
      pointerEvents: 'none', cursor: 'crosshair',
    });
    const outline = document.createElement('div');
    Object.assign(outline.style, {
      position: 'fixed', display: 'none', pointerEvents: 'none',
      border: '2px solid #f59e0b', background: 'rgba(245,158,11,0.10)',
      borderRadius: '8px', zIndex: '2147483647',
    });
    layer.append(outline);
    document.documentElement.appendChild(layer);
    const selectorFor = (el) => {
      if (el.id) return '#' + CSS.escape(el.id);
      const parts = [];
      let node = el;
      while (node && node.nodeType === 1 && parts.length < 5) {
        let part = node.tagName.toLowerCase();
        if (node.classList && node.classList.length) {
          part += '.' + [...node.classList].slice(0, 2).map((c) => CSS.escape(c)).join('.');
        }
        const parent = node.parentElement;
        if (parent) {
          const siblings = [...parent.children].filter((x) => x.tagName === node.tagName);
          if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
        }
        parts.unshift(part);
        node = node.parentElement;
      }
      return parts.join(' > ');
    };
    const describe = (el) => {
      const rect = el.getBoundingClientRect();
      const text = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
      return {
        kind: 'element',
        url: location.href,
        markId: el.getAttribute('data-mark-id') ? Number(el.getAttribute('data-mark-id')) : undefined,
        selector: selectorFor(el),
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        name: text.slice(0, 120),
        text,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    };
    const onMove = (event) => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (!el || el === layer || el === outline) return;
      const rect = el.getBoundingClientRect();
      Object.assign(outline.style, {
        display: 'block', left: rect.left + 'px', top: rect.top + 'px',
        width: rect.width + 'px', height: rect.height + 'px',
      });
    };
    const cleanup = () => {
      layer.remove();
      document.getElementById('__kuang_collab_pick_chip')?.remove();
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.__kuangCollabPicking = false;
      delete window.__kuangCollabPickerCancel;
    };
    const finish = (value) => {
      cleanup();
      resolve(value);
    };
    const onClick = (event) => {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      if (!el || el === layer || el === outline) return;
      event.preventDefault();
      event.stopPropagation();
      const target = describe(el);
      window.__hbCollabShowElementToolbar(el, target);
      finish(target);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(null); }
    };
    window.__kuangCollabPicking = true;
    window.__kuangCollabPickerCancel = () => finish(null);
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  })`;
