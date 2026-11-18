/**
 * Shadow-DOM-aware element resolution for the interaction path.
 *
 * `document.querySelector` cannot cross a shadow boundary, and neither can a CSS
 * selector — so on a page built from web components (login/signup forms, design-system
 * dialogs) a selector like `#email` or `faceplate-text-input` resolves to the *host*,
 * never the `<input>` that actually takes focus and text. The field notes for the
 * 2026-10-20 signup run are the worked example: `act({selector, action:"type"})` reported
 * success while the value never changed, because the click landed on the host's centre
 * (often a label) and the follow-up `el.focus()` was applied to the host.
 *
 * These helpers resolve a selector to the element a *mouse* would hit — the deepest
 * control painted at the host's centre, or the first control inside it — and report the
 * deepest focused element (`document.activeElement` is the host, `shadowRoot.activeElement`
 * is the real input).
 *
 * They are page-side source strings, evaluated through the host's `evaluate`.
 */

import { DEEP_DOM_HELPERS } from './deep-dom.js';

export { DEEP_DOM_HELPERS } from './deep-dom.js';


/** When to use: addressing a control by selector, mark id or point. */
export interface TargetLocator {
  markId?: number;
  selector?: string;
  point?: { x: number; y: number };
}

/** A page-side expression yielding the addressed element (shadow-aware for selectors). */
export function elementExpr(locator: TargetLocator): string {
  if (locator.markId !== undefined && locator.markId !== null) {
    return `kqDeep('[data-mark-id="${locator.markId}"]')`;
  }
  if (locator.selector) return `kqDeep(${JSON.stringify(locator.selector)})`;
  if (locator.point) return `kqAtPoint(${Math.round(locator.point.x)}, ${Math.round(locator.point.y)})`;
  return 'null';
}

/** When to use: reading the resolved control box and whether it is in view. */
export interface TargetBox {
  x: number;
  y: number;
  tag: string;
  hostTag: string;
  /** True when the resolved element is a text/value control rather than the host. */
  control: boolean;
  /** False when the selector resolved through a shadow root to a deeper element. */
  sameAsHost: boolean;
  text: string;
  /** Live viewport size — 0 means the tab was never laid out, so the box is meaningless. */
  vw: number;
  vh: number;
  /** Whether the resolved centre falls inside the viewport. */
  inViewport: boolean;
}

/**
 * Resolve a locator to the box of the **control** to act on, scrolling it into view.
 * `elementFromPoint`-free for point locators (a point is already a viewport coordinate,
 * and re-scrolling it would invalidate the caller's coordinates).
 */
export function targetBoxScript(locator: TargetLocator): string {
  const scroll = locator.point ? '' : 'try { host.scrollIntoView({ behavior: "auto", block: "center" }); } catch (e) {}';
  return `(() => {${DEEP_DOM_HELPERS}
  const host = ${elementExpr(locator)};
  if (!host) return null;
  ${scroll}
  const target = ${locator.point ? 'host' : 'kqResolveControl(host)'};
  if (!target) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const point = kqSafePoint(target);
  const x = point.x;
  const y = point.y;
  return {
    x: x,
    y: y,
    tag: (target.tagName || '').toLowerCase(),
    hostTag: (host.tagName || '').toLowerCase(),
    control: kqIsControl(target),
    sameAsHost: target === host,
    text: String(target.innerText || target.textContent || kqLabel(target) || '').trim().slice(0, 80),
    vw: vw,
    vh: vh,
    inViewport: x >= 0 && y >= 0 && x <= vw && y <= vh,
  };
})()`;
}

/**
 * Typed facts about the control a locator addresses — the same shape as the previous
 * light-DOM probe, but resolved through shadow roots, so a web-component field reports
 * `tag: "input"` (not the host) and its real value length.
 */
export function fieldFactsScript(locator: TargetLocator): string {
  return `(() => {${DEEP_DOM_HELPERS}
  const host = ${elementExpr(locator)};
  if (!host) return null;
  const el = ${locator.point ? 'host' : 'kqResolveControl(host)'};
  if (!el) return null;
  if (!kqIsControl(el)) return null;
  const tag = el.tagName.toLowerCase();
  const value = kqValue(el);
  return {
    tag: tag,
    type: el.getAttribute('type') || undefined,
    role: el.getAttribute('role') || undefined,
    name: kqLabel(el) || undefined,
    valueLength: value.length,
    isEmpty: value.length === 0,
    prefilled: value.length > 0,
    editable: !el.disabled && !el.readOnly,
    required: el.required === true,
    disabled: el.disabled === true,
    inShadowRoot: Boolean(el.getRootNode && el.getRootNode() !== document && el.getRootNode().host),
  };
})()`;
}

/**
 * Focus the resolved control and report where focus actually ended up.
 *
 * Applied to the **control**, never the custom-element host: `host.focus()` either
 * steals focus from the inner `<input>` or does nothing, and either way the following
 * keystrokes go nowhere. Returns the resulting deep active element so the caller can
 * see a focus failure instead of inferring it later.
 */
export function focusControlScript(locator: TargetLocator): string {
  return `(() => {${DEEP_DOM_HELPERS}
  const host = ${elementExpr(locator)};
  if (!host) return null;
  const el = kqResolveControl(host);
  if (!el || !kqIsControl(el)) return { focused: null, tag: el && el.tagName ? el.tagName.toLowerCase() : null };
  try { el.focus({ preventScroll: true }); } catch (e) {}
  const active = kqActive();
  return {
    focused: active === el,
    tag: (el.tagName || '').toLowerCase(),
    activeTag: active && active.tagName ? active.tagName.toLowerCase() : null,
    activeId: active && active.id ? active.id : null,
  };
})()`;
}

/** Page/window diagnostics including the **deepest** focused element. */export function diagnosticsScript(): string {
  return `(() => {${DEEP_DOM_HELPERS}
  const active = kqActive();
  return {
    w: window.innerWidth,
    h: window.innerHeight,
    active: active ? { tag: (active.tagName || '').toLowerCase(), id: active.id || undefined, label: kqLabel(active) || undefined } : null,
    hasFocus: document.hasFocus(),
  };
})()`;
}

/**
 * Install a one-shot input probe around a typing action: snapshot the addressed control's
 * value, then count the trusted key/input events that reach the page.
 *
 * This is the evidence that separates the two failure classes seen in the field — "our
 * input never arrived" (focus/window) from "the control received the keys and refused
 * them" (one-time-code fields, which revert on input). Only lengths and counters leave the
 * page; the value itself never does (so `secret` typing stays secret).
 */
export function inputProbeInstallScript(locator: TargetLocator): string {
  return `(() => {${DEEP_DOM_HELPERS}
  const prev = window.__kuangInputProbe;
  if (prev && prev.detach) prev.detach();
  const host = ${elementExpr(locator)};
  const el = host ? ${locator.point ? 'host' : 'kqResolveControl(host)'} : null;
  // A point inside a closed shadow root resolves to the custom-element host: events still reach
  // the page, but its value is unreadable. Do not pretend that is a failed keystroke.
  const observable = Boolean(el && (kqIsControl(el) || el.isContentEditable === true));
  const state = {
    target: el,
    value: kqValue(el),
    observable: observable,
    keydowns: 0,
    beforeinputs: 0,
    inputs: 0,
  };
  const listen = (type, key) => {
    const handler = (e) => { if (e.isTrusted) state[key]++; };
    document.addEventListener(type, handler, true);
    return [type, handler];
  };
  const bound = [listen('keydown', 'keydowns'), listen('beforeinput', 'beforeinputs'), listen('input', 'inputs')];
  state.detach = () => { for (const [type, handler] of bound) document.removeEventListener(type, handler, true); };
  window.__kuangInputProbe = state;
  return { installed: true, found: Boolean(el), control: el ? kqIsControl(el) : false, observable: observable, tag: el && el.tagName ? el.tagName.toLowerCase() : null };
})()`;
}

/** Read and remove the probe installed by {@link inputProbeInstallScript}. */
export function inputProbeReadScript(): string {
  return `(() => {${DEEP_DOM_HELPERS}
  const s = window.__kuangInputProbe;
  if (!s) return null;
  if (s.detach) s.detach();
  const el = s.target;
  const beforeLength = String(s.value || '').length;
  if (!el || !el.isConnected) {
    // The control was re-rendered mid-type (React/Lit swap): the after-value is
    // unknowable, so report no verdict rather than a false one.
    delete window.__kuangInputProbe;
    return { beforeLength: beforeLength, afterLength: null, changed: null, detached: true, keydowns: s.keydowns, beforeinputs: s.beforeinputs, inputs: s.inputs };
  }
  const after = kqValue(el);
  const out = {
    beforeLength: beforeLength,
    afterLength: after.length,
    changed: after !== s.value,
    observable: s.observable !== false,
    detached: false,
    keydowns: s.keydowns,
    beforeinputs: s.beforeinputs,
    inputs: s.inputs,
  };
  delete window.__kuangInputProbe;
  return out;
})()`;
}
