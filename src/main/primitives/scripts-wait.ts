/**
 * The page-side probes for state and readiness: the page signature, the stability sampler and
 * the wait-condition probe builder.
 */
import type { WaitCondition } from './types.js';

/** When to use: deciding whether a wait condition needs a DOM probe or the host revision. */
export const DOM_WAIT_TYPES = new Set(['selector', 'gone', 'text', 'url', 'role_name', 'find', 'count']);

/** When to use: pacing a wait loop between probes. */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Page signature probe — one cheap round trip, no DOM mutation. */
export const SIGNATURE_SCRIPT = `(() => {
  const t = (document.body && document.body.innerText) || '';
  let h = 0;
  for (let i = 0; i < t.length; i++) { h = (h * 31 + t.charCodeAt(i)) | 0; }
  return {
    url: location.href,
    title: document.title,
    nodeCount: document.getElementsByTagName('*').length,
    height: Math.max(document.documentElement.scrollHeight || 0, (document.body && document.body.scrollHeight) || 0),
    scrollY: Math.round(window.scrollY || 0),
    textLen: t.length,
    textHash: h,
    inputs: document.querySelectorAll('input,textarea,select').length,
    forms: document.querySelectorAll('form').length
  };
})()`;

/** When to use: sampling whether the page has stopped changing (wait_for type "stable"). */
export const STABILITY_SCRIPT = `(() => {
  const t = (document.body && document.body.innerText) || '';
  return {
    height: Math.max(document.documentElement.scrollHeight || 0, (document.body && document.body.scrollHeight) || 0),
    text: t.length,
    nodes: document.getElementsByTagName('*').length
  };
})()`;

/** Shared helpers injected with every probe (kept as one string constant). */
export const PROBE_HELPERS = `
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
    return true;
  };
  const accName = (el) => {
    let n = clean(el.getAttribute && el.getAttribute('aria-label'));
    if (n) return n;
    n = clean(el.innerText || el.textContent);
    if (n) return n;
    if (el.getAttribute) {
      for (const a of ['placeholder', 'title', 'alt', 'name', 'value']) {
        const v = el.getAttribute(a);
        if (v) return clean(v);
      }
    }
    return '';
  };
  const resolveRoot = (ref, selector) => {
    if (ref !== null && ref !== undefined) return document.querySelector('[data-mark-id="' + ref + '"]');
    if (selector) return document.querySelector(selector);
    return document.body;
  };
`;

/** When to use: compiling wait_for/expect conditions into one page-side probe. */
export function buildWaitProbe(conditions: WaitCondition[]): string {
  return `(() => {
    const conds = ${JSON.stringify(conditions)};
    ${PROBE_HELPERS}
    return conds.map((c) => {
      try {
        if (c.type === 'selector') {
          const el = document.querySelector(c.selector);
          if (!el) return { type: c.type, ok: false, evidence: 'not found' };
          if (c.visible && !isVisible(el)) return { type: c.type, ok: false, evidence: 'present but hidden' };
          return { type: c.type, ok: true, evidence: clean(el.innerText || el.textContent).slice(0, 80) };
        }
        if (c.type === 'gone') {
          return { type: c.type, ok: !document.querySelector(c.selector), evidence: '' };
        }
        if (c.type === 'text') {
          const body = (document.body && document.body.innerText) || '';
          const ok = c.regex ? new RegExp(c.regex, c.flags || 'i').test(body) : body.indexOf(c.text) !== -1;
          return { type: c.type, ok: ok, evidence: ok ? 'found' : 'absent' };
        }
        if (c.type === 'url') {
          const u = location.href;
          const pat = c.pattern || c.text || '';
          const ok = c.regex ? new RegExp(c.regex).test(u) : u.indexOf(pat) !== -1;
          return { type: c.type, ok: ok, evidence: u.slice(0, 120) };
        }
        if (c.type === 'role_name' || c.type === 'find') {
          const role = (c.role || '').toLowerCase();
          const name = (c.name || c.text || '').toLowerCase();
          const nodes = document.querySelectorAll('[role],button,a[href],input,select,textarea,summary,[tabindex]');
          for (const el of nodes) {
            const r = (el.getAttribute('role') || el.tagName.toLowerCase()).toLowerCase();
            if (role && r !== role) continue;
            const n = accName(el).toLowerCase();
            if (name && n.indexOf(name) === -1) continue;
            if (!isVisible(el)) continue;
            return { type: c.type, ok: true, evidence: n.slice(0, 80) };
          }
          return { type: c.type, ok: false, evidence: 'no match' };
        }
        if (c.type === 'count') {
          const n = document.querySelectorAll(c.selector).length;
          let ok;
          if (c.equals !== undefined) ok = n === c.equals;
          else if (c.min !== undefined) ok = n >= c.min;
          else ok = n > 0;
          if (ok && c.max !== undefined) ok = n <= c.max;
          return { type: c.type, ok: ok, evidence: String(n) };
        }
        return { type: c.type, ok: false, evidence: 'unsupported-in-page' };
      } catch (e) {
        return { type: c.type, ok: false, evidence: 'error: ' + (e && e.message) };
      }
    });
  })()`;
}
