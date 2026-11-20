/**
 * The thread overlay: one card per saved thread, anchored to its element, with resolve/exit
 * reported over the same console channel.
 */
import { COLLAB_CSS } from './overlay-css.js';
import { COLLABORATION_EXIT_PREFIX, COLLABORATION_RESOLVE_PREFIX } from './overlay-prefixes.js';
import type { CollaborationThread } from '../../shared/collaboration.js';

/** When to use: injecting the saved-thread overlay into a page. */
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
    const layer = document.createElement('div');
    layer.id = layerId;
    layer.setAttribute('style', 'position:absolute;inset:0;z-index:2147483646;pointer-events:none;');
    document.body.appendChild(layer);
    // Focus navigation (orb toolbar back/forward + note list): always present,
    // even with zero threads, so collab mode stays responsive.
    window.__hbCollabFocusId = window.__hbCollabFocusId || null;
    window.__hbCollabMode = Boolean(window.__hbCollabMode);
    const clearFocus = function () {
      layer.querySelectorAll('.hb-focus-ring, .hb-flash').forEach(function (node) {
        node.classList.remove('hb-focus-ring', 'hb-flash');
      });
      window.__hbCollabFocusId = null;
    };
    window.__hbCollabToast = function (text) {
      const prior = document.getElementById('__kuang_collab_toast');
      if (prior) prior.remove();
      const toast = document.createElement('div');
      toast.id = '__kuang_collab_toast';
      toast.textContent = text;
      Object.assign(toast.style, {
        position: 'fixed', left: '50%', bottom: '88px', transform: 'translateX(-50%)',
        zIndex: '2147483647', padding: '7px 14px', borderRadius: '999px',
        border: '1px solid rgba(34,197,94,0.55)', background: 'rgba(22,101,52,0.92)',
        color: '#bbf7d0', font: '600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        letterSpacing: '0.05em', boxShadow: '0 10px 26px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      });
      document.body.appendChild(toast);
      setTimeout(function () {
        toast.style.opacity = '0';
        setTimeout(function () { toast.remove(); }, 220);
      }, 1600);
    };
    window.__hbCollabEnterMode = function () {
      window.__hbCollabMode = true;
      layer.style.display = '';
      layer.classList.add('is-collab-active');
      if (window.__hbCollabModeKeyHandler) {
        document.removeEventListener('keydown', window.__hbCollabModeKeyHandler, true);
      }
      window.__hbCollabModeKeyHandler = function (event) {
        if (event.key !== 'Escape' || !window.__hbCollabMode) return;
        const cssEditor = document.getElementById('__kuang_collab_csspop');
        if (cssEditor) {
          cssEditor.remove();
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        // Escape from note mode cancels its current tool and exits collab mode
        // in one press; the page must never look selected after the toolbar is gone.
        if (window.__kuangCollabPicking) window.__kuangCollabPickerCancel?.();
        if (document.getElementById('__kuang_collab_drawer')) window.__kuangCollabSelectionCancel?.();
        event.preventDefault();
        event.stopImmediatePropagation();
        console.log(${JSON.stringify(COLLABORATION_EXIT_PREFIX)});
      };
      document.addEventListener('keydown', window.__hbCollabModeKeyHandler, true);
      if (window.__hbCollabFocusId) window.__hbCollabShowThread(window.__hbCollabFocusId);
    };
    window.__hbCollabExitMode = function () {
      window.__hbCollabMode = false;
      if (window.__hbCollabModeKeyHandler) {
        document.removeEventListener('keydown', window.__hbCollabModeKeyHandler, true);
        delete window.__hbCollabModeKeyHandler;
      }
      layer.style.display = 'none';
      layer.classList.remove('is-collab-active');
      clearFocus();
      document.getElementById('__kuang_collab_csspop')?.remove();
      document.getElementById('__kuang_collab_elementbar')?.remove();
      document.querySelectorAll('.hb-el-selected').forEach(function (node) {
        node.classList.remove('hb-el-selected');
      });
      delete window.__hbCollabSelection;
    };
    if (!window.__hbCollabMode) layer.style.display = 'none';
    window.__hbCollabShowThread = function (id) {
      const thread = threads.find(function (t) { return t.id === id; });
      layer.querySelectorAll('.hb-focus-ring').forEach(function (node) {
        node.classList.remove('hb-focus-ring');
      });
      if (!thread) {
        window.__hbCollabFocusId = null;
        return;
      }
      window.__hbCollabFocusId = id;
      const box = layer.querySelector('[data-thread-id="' + id + '"]');
      if (box) {
        box.classList.add('hb-focus-ring');
        box.classList.remove('hb-flash');
      }
      if (thread.target.selector) {
        try {
          const el = document.querySelector(thread.target.selector);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {}
      }
      if (box) box.classList.add('hb-flash');
    };
    if (window.__hbCollabFocusId && !threads.some(function (t) { return t.id === window.__hbCollabFocusId; })) {
      window.__hbCollabFocusId = null;
    }
    const rectFor = (target) => {
      try {
        if (target.markId !== undefined) {
          const el = document.querySelector('[data-mark-id="' + target.markId + '"]');
          if (el) return el.getBoundingClientRect();
        }
        if (target.selector) {
          const el = document.querySelector(target.selector);
          if (el) return el.getBoundingClientRect();
        }
      } catch {}
      return target.rect
        ? { left: target.rect.x, top: target.rect.y, width: target.rect.width, height: target.rect.height }
        : null;
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
    const usableWidth = Math.max(0, innerWidth - RIGHT_INSET);
    const placedCards = [];
    for (const thread of threads) {
      const rect = rectFor(thread.target);
      if (!rect || rect.width <= 0 || rect.height <= 0) continue;
      const offsetX = scrollX;
      const offsetY = scrollY;
      const box = document.createElement('div');
      box.className = 'hb-box' + (thread.humanOnly ? ' hb-human' : '');
      box.setAttribute('data-thread-id', thread.id);
      Object.assign(box.style, {
        left: rect.left + offsetX + 'px', top: rect.top + offsetY + 'px',
        width: Math.max(8, rect.width) + 'px', height: Math.max(8, rect.height) + 'px',
      });
      const card = document.createElement('div');
      card.className = 'hb-agent' + (thread.humanOnly ? ' hb-human' : '');
      const head = document.createElement('div');
      head.className = 'hb-agent-head';
      const dot = document.createElement('span');
      dot.className = 'hb-agent-dot';
      const label = document.createElement('span');
      label.textContent = 'Collab';
    const id = document.createElement('span');
    id.className = 'hb-agent-id';
    id.textContent = thread.id.slice(-6);
    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'hb-resolve';
    resolve.textContent = '✓';
    resolve.title = 'Resolve this note';
    resolve.setAttribute('aria-label', 'Resolve this collaboration note');
    resolve.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      resolve.disabled = true;
      resolve.textContent = '…';
      console.log(RESOLVE_PREFIX + JSON.stringify({ id: thread.id }));
    });
    head.append(dot, label, id, resolve);
      const text = document.createElement('div');
      text.className = 'hb-agent-body is-clamped';
      text.textContent = thread.text || 'No message yet.';
      card.append(head, text);
      card.addEventListener('click', () => {
        text.classList.toggle('is-clamped');
      });
      const arrow = document.createElement('div');
      arrow.className = 'hb-agent-arrow';
      layer.append(box, card);
      const width = card.offsetWidth || 250;
      const height = card.offsetHeight || 60;
      const margin = 10;
      let top = rect.top - height - margin;
      let pointingUp = false;
      if (top < margin) {
        top = rect.bottom + margin;
        pointingUp = true;
      }
      const left = clamp(rect.left, margin, Math.max(margin, usableWidth - width - margin));
      // Stack cards that would cover each other instead of overlapping.
      let docTop = top + offsetY;
      const overlaps = () =>
        placedCards.some(
          (other) =>
            left + offsetX < other.left + other.width + 8 &&
            left + offsetX + width + 8 > other.left &&
            docTop < other.top + other.height + 8 &&
            docTop + height + 8 > other.top,
        );
      let guard = 0;
      while (overlaps() && guard < 12) {
        docTop += height + 10;
        guard += 1;
      }
      docTop = clamp(docTop, margin, Math.max(margin, document.documentElement.scrollHeight - height - margin));
      placedCards.push({ left: left + offsetX, top: docTop, width, height });
      card.style.left = Math.round(left + offsetX) + 'px';
      card.style.top = Math.round(docTop) + 'px';
      if (pointingUp) {
        arrow.style.top = '-6px';
        arrow.style.left = clamp(rect.left + rect.width / 2 - left - 5, 12, Math.max(12, width - 22)) + 'px';
        arrow.style.transform = 'rotate(45deg)';
      } else {
        arrow.style.bottom = '-6px';
        arrow.style.left = clamp(rect.left + rect.width / 2 - left - 5, 12, Math.max(12, width - 22)) + 'px';
        arrow.style.transform = 'rotate(225deg)';
      }
      card.append(arrow);
    }
    document.documentElement.appendChild(layer);
    if (window.__hbCollabMode && window.__hbCollabFocusId && threads.some(function (t) { return t.id === window.__hbCollabFocusId; })) {
      window.__hbCollabShowThread(window.__hbCollabFocusId);
    }
  })()`;
}
