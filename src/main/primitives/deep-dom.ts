/**
 * Deep-DOM helper source shared by every injected targeting script.
 *
 * One string of in-page functions: resolving elements through open shadow roots,
 * picking a point the element actually owns (a card's centre is often covered),
 * reading values/labels and following composed parents. Kept apart from the scripts
 * that embed it so each script stays readable.
 *
 * When to use: composing an injected script that must resolve controls through shadow
 * DOM (marks, targeting, input probing). Never edit a copy — import this string.
 */

/** Shared helper functions, inlined into every script below. */
export const DEEP_DOM_HELPERS = `
function kqDeep(selector, root) {
  root = root || document;
  let direct = null;
  try { direct = root.querySelector(selector); } catch (e) { return null; }
  if (direct) return direct;
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    if (el.shadowRoot) {
      const hit = kqDeep(selector, el.shadowRoot);
      if (hit) return hit;
    }
  }
  return null;
}
function kqAtPoint(x, y) {
  let el = document.elementFromPoint(x, y);
  let guard = 0;
  while (el && el.shadowRoot && guard++ < 25) {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}
function kqIsControl(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}
function kqIsAction(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute ? (el.getAttribute('role') || '') : '';
  return tag === 'a' || tag === 'button' || role === 'button' || role === 'link';
}
function kqFirstControl(root) {
  if (root.shadowRoot) {
    const inShadow = kqFirstControl(root.shadowRoot);
    if (inShadow) return inShadow;
  }
  const direct = root.querySelectorAll('input, textarea, select, [contenteditable], [role="textbox"], [role="combobox"]');
  for (let i = 0; i < direct.length; i++) {
    if (!direct[i].disabled) return direct[i];
  }
  const all = root.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].shadowRoot) {
      const hit = kqFirstControl(all[i].shadowRoot);
      if (hit) return hit;
    }
  }
  return null;
}
function kqResolveControl(host) {
  if (!host) return null;
  if (kqIsControl(host) || kqIsAction(host)) return host;
  const r = host.getBoundingClientRect ? host.getBoundingClientRect() : null;
  if (r && r.width > 0 && r.height > 0) {
    // What an actual mouse would hit at the host's centre.
    const at = kqAtPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    if (at && kqIsControl(at)) return at;
  }
  // Contenteditable hosts / detached-at-centre cases: take the first control inside.
  return kqFirstControl(host) || host;
}
function kqComposedParent(node) {
  if (!node) return null;
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode ? node.getRootNode() : null;
  return root && root.host ? root.host : null;
}
function kqClosest(node, selector) {
  let el = node;
  let guard = 0;
  while (el && guard++ < 200) {
    if (el.matches && el.matches(selector)) return el;
    el = kqComposedParent(el);
  }
  return null;
}
function kqContainsComposed(ancestor, node) {
  let cur = node;
  let guard = 0;
  while (cur && guard++ < 200) {
    if (cur === ancestor) return true;
    cur = kqComposedParent(cur);
  }
  return false;
}
/**
 * Pick a point that actually belongs to the element. Large card links (Reddit posts, product tiles)
 * routinely have their geometric centre covered by a nested overlay/thumbnail, so clicking the centre
 * hits a sibling and nothing happens. Try the centre, then a few offsets, and require the hit to be
 * the element itself or a descendant of it.
 */
function kqSafePoint(el) {
  const r = el.getBoundingClientRect();
  // Work in the VISIBLE portion: a card taller than the viewport has its geometric centre
  // off-screen, where elementFromPoint returns null and every offset "fails".
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(r.left, 0);
  const right = Math.min(r.right, vw);
  const top = Math.max(r.top, 0);
  const bottom = Math.min(r.bottom, vh);
  const box = right > left && bottom > top ? { left: left, top: top, width: right - left, height: bottom - top } : { left: r.left, top: r.top, width: r.width, height: r.height };
  const offsets = [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7], [0.5, 0.18], [0.5, 0.82], [0.18, 0.5], [0.82, 0.5]];
  for (let i = 0; i < offsets.length; i++) {
    const x = Math.round(box.left + box.width * offsets[i][0]);
    const y = Math.round(box.top + box.height * offsets[i][1]);
    if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
    const hit = kqAtPoint(x, y);
    if (hit && (hit === el || kqContainsComposed(el, hit))) return { x: x, y: y, covered: false };
  }
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2), covered: true };
}
function kqActive() {  let el = document.activeElement;
  let guard = 0;
  while (el && el.shadowRoot && el.shadowRoot.activeElement && guard++ < 25) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}
function kqValue(el) {
  if (!el) return '';
  if (el.isContentEditable === true) return String(el.textContent || '');
  if (el.tagName && el.tagName.toLowerCase() === 'select') {
    const opt = el.options ? el.options[el.selectedIndex] : null;
    return opt ? String(opt.value || opt.textContent || '') : '';
  }
  return el.value === undefined || el.value === null ? '' : String(el.value);
}
function kqLabel(el) {
  if (!el || !el.getAttribute) return '';
  return String(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.id || '').trim().slice(0, 60);
}
function kqDescribe(el) {
  if (!el || !el.tagName) return null;
  const tag = el.tagName.toLowerCase();
  return {
    tag: tag,
    id: el.id || undefined,
    label: kqLabel(el) || undefined,
    valueLength: kqValue(el).length,
    control: kqIsControl(el),
  };
}
`;
