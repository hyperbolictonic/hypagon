/**
 * The programs the primitives inject into the page.
 *
 * Why a module: the wait probe, the structured extractor and the scroll-and-
 * dedupe collector are page-side programs, not orchestration — each is a
 * template literal plus shared helpers, and none of them reads host state. They
 * were the largest functions left in `primitives.ts`; here they can be read (and
 * changed) without scrolling past the controller.
 */
import type { CollectOptions, ExtractOptions, WaitCondition } from './options.js';

/** When to use: pageState and diff — one cheap signature round trip, no DOM mutation. */
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

/** When to use: the `stable` wait condition — the height/text/nodes triple it compares. */
export const STABILITY_SCRIPT = `(() => {
  const t = (document.body && document.body.innerText) || '';
  return {
    height: Math.max(document.documentElement.scrollHeight || 0, (document.body && document.body.scrollHeight) || 0),
    text: t.length,
    nodes: document.getElementsByTagName('*').length
  };
})()`;

/** When to use: every probe that needs clean / isVisible / accName / resolveRoot. */
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

/** When to use: wait_for and expect — the declarative condition probe. */
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

/** When to use: every extract kind — the bindings they share (root, limit, row shape). */
const EXTRACT_PRELUDE = `
    const abs = (h) => { try { return new URL(h, location.href).href; } catch (e) { return h; } };
    const root = resolveRoot(opts.ref, opts.selector);
    if (!root) return { error: 'root not found', kind: opts.kind };
    const limit = opts.limit && opts.limit > 0 ? opts.limit : 200;
    const sig = (el) => el.tagName + '|' + (typeof el.className === 'string' ? (el.className.split(/\\s+/).filter(Boolean)[0] || '') : '') + '|' + (el.getAttribute('role') || '') + '|' + el.children.length;
    const rowOf = (el) => {
      const a = el.matches && el.matches('a[href]') ? el : el.querySelector('a[href]');
      const markEl = el.getAttribute && el.getAttribute('data-mark-id') ? el : el.querySelector('[data-mark-id]');
      return {
        text: clean(el.innerText || el.textContent).slice(0, 400),
        href: a ? abs(a.getAttribute('href')) : undefined,
        aria: clean(el.getAttribute && el.getAttribute('aria-label')) || undefined,
        mark: markEl ? Number(markEl.getAttribute('data-mark-id')) : undefined
      };
    };
`;

/** kind=app_data — embedded JSON state blobs. */
const EXTRACT_APP_DATA = `
    if (opts.kind === 'app_data') {
      const maxChars = opts.limit && opts.limit > 0 ? opts.limit : 20000;
      const sources = [];
      const push = (name, text) => {
        if (!text) return;
        let data = null; let err = null;
        try { data = JSON.parse(text); } catch (e) { err = String(e && e.message); }
        sources.push({ source: name, bytes: text.length, parsed: data !== null, error: err || undefined, data: data !== null ? data : text.slice(0, maxChars) });
      };
      const nextData = document.getElementById('__NEXT_DATA__');
      if (nextData) push('__NEXT_DATA__', nextData.textContent);
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s, i) => push('ld+json#' + i, s.textContent));
      document.querySelectorAll('script[type="application/json"]').forEach((s) => push('application/json' + (s.id ? '#' + s.id : ''), s.textContent));
      for (const key of ['__NUXT__', '__INITIAL_STATE__', '__DATA__', '__APOLLO_STATE__', '__PRELOADED_STATE__']) {
        if (window[key] && typeof window[key] === 'object') { try { push(key, JSON.stringify(window[key])); } catch (e) {} }
      }
      let scanned = 0;
      for (const key of Object.keys(window)) {
        if (++scanned > 4000) break;
        if (!/^__.*(STATE|DATA|PROPS)__$/.test(key)) continue;
        const v = window[key];
        if (v && typeof v === 'object') { try { push(key, JSON.stringify(v)); } catch (e) {} }
      }
      return { kind: 'app_data', count: sources.length, sources: sources.slice(0, 20) };
    }
`;

/** kind=schema_org — JSON-LD items, optionally filtered by @type. */
const EXTRACT_SCHEMA_ORG = `
    if (opts.kind === 'schema_org') {
      const items = [];
      const typeCounts = {};
      const visit = (node) => {
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (!node || typeof node !== 'object') return;
        const t = node['@type'];
        if (t) {
          const tl = Array.isArray(t) ? t : [t];
          tl.forEach((tt) => { typeCounts[tt] = (typeCounts[tt] || 0) + 1; });
          items.push({ type: tl[0], types: tl, data: node });
        }
        if (node['@graph']) visit(node['@graph']);
      };
      let scanned = 0;
      document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
        if (scanned++ >= 25) return;
        let parsed = null;
        try { parsed = JSON.parse(s.textContent); } catch (e) { return; }
        visit(parsed);
      });
      const want = (opts.type || '').toLowerCase();
      const filtered = want ? items.filter((it) => it.types.some((tt) => String(tt).toLowerCase() === want)) : items;
      return { kind: 'schema_org', count: filtered.slice(0, limit).length, total: filtered.length, types: Object.keys(typeCounts), items: filtered.slice(0, limit) };
    }
`;

/** kind=tables — every table on the page. */
const EXTRACT_TABLES = `
    if (opts.kind === 'tables') {
      const tables = [];
      const collect = (table) => {
        const headers = Array.from(table.querySelectorAll('thead th')).map((th) => clean(th.innerText));
        const bodyRows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.querySelector('td'));
        const rows = bodyRows.slice(0, limit).map((tr) => Array.from(tr.querySelectorAll('td,th')).map((td) => clean(td.innerText)));
        if (!rows.length && !headers.length) return;
        const hs = headers.length ? headers : (rows[0] ? rows[0].map((_, i) => 'col' + i) : []);
        const records = rows.map((cells) => { const o = {}; cells.forEach((c, i) => { o[hs[i] || ('col' + i)] = c; }); return o; });
        tables.push({ index: tables.length, headers: hs, count: rows.length, records: records });
      };
      Array.from(document.querySelectorAll('table')).forEach(collect);
      Array.from(document.querySelectorAll('[role="table"],[role="grid"]')).forEach((grid) => {
        if (grid.closest('table')) return;
        const headers = Array.from(grid.querySelectorAll('[role="columnheader"]')).map((h) => clean(h.innerText));
        const rows = Array.from(grid.querySelectorAll('[role="row"]')).map((r) => Array.from(r.querySelectorAll('[role="cell"],[role="gridcell"],[role="columnheader"]')).map((c) => clean(c.innerText))).filter((c) => c.length);
        if (!rows.length && !headers.length) return;
        const hs = headers.length ? headers : (rows[0] ? rows[0].map((_, i) => 'col' + i) : []);
        const records = rows.map((cells) => { const o = {}; cells.forEach((c, i) => { o[hs[i] || ('col' + i)] = c; }); return o; });
        tables.push({ index: tables.length, headers: hs, count: rows.length, records: records });
      });
      return { kind: 'tables', count: tables.length, tables: tables.slice(0, 20) };
    }
`;

/** kind=table — the table under the target root. */
const EXTRACT_TABLE = `
    if (opts.kind === 'table') {
      const table = root.tagName === 'TABLE' ? root : root.querySelector('table');
      if (table) {
        const headers = Array.from(table.querySelectorAll('thead th')).map((th) => clean(th.innerText));
        const bodyRows = Array.from(table.querySelectorAll('tr')).filter((tr) => tr.querySelector('td'));
        const rows = bodyRows.slice(0, limit).map((tr) => Array.from(tr.querySelectorAll('td,th')).map((td) => clean(td.innerText)));
        const hs = headers.length ? headers : rows[0].map((_, i) => 'col' + i);
        const records = rows.map((cells) => { const o = {}; cells.forEach((c, i) => { o[hs[i] || ('col' + i)] = c; }); return o; });
        return { kind: 'table', headers: hs, count: rows.length, rows: rows, records: records };
      }
      const headers = Array.from(root.querySelectorAll('[role="columnheader"]')).map((h) => clean(h.innerText));
      const rowEls = Array.from(root.querySelectorAll('[role="row"]'));
      const rows = rowEls.map((r) => Array.from(r.querySelectorAll('[role="cell"],[role="gridcell"],[role="columnheader"]')).map((c) => clean(c.innerText))).filter((c) => c.length);
      const hs = headers.length ? headers : (rows[0] ? rows[0].map((_, i) => 'col' + i) : []);
      const records = rows.map((cells) => { const o = {}; cells.forEach((c, i) => { o[hs[i] || ('col' + i)] = c; }); return o; });
      return { kind: 'table', headers: hs, count: rows.length, rows: rows.slice(0, limit), records: records.slice(0, limit) };
    }
`;

/** kind=list (default) — the repeating item container, by content density. */
const EXTRACT_LIST = `
    // list
    // Skip non-content subtrees: script clusters look exactly like a "repeating item container"
    // (N siblings, identical signature) and would otherwise win and return JS source instead of
    // rows. Seen on Skyscanner, which keeps ~700 inline scripts under <head>.
    const NON_CONTENT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'HEAD', 'TITLE', 'SVG', 'IFRAME', 'CANVAS']);
    const isContent = (el) => el && !NON_CONTENT.has(el.tagName) && isVisible(el);
    // A result row is a *content-bearing* child. Requiring identical sibling signatures (the old
    // heuristic) breaks the moment one card is a sponsored ad or a "show more" divider, so score
    // by density of text-bearing children and prefer the deepest container that still wins.
    const isItem = (el) => isContent(el) && ((el.innerText || '').trim().length >= 25 || !!el.querySelector('a[href]'));
    let best = null; let bestScore = 0;
    const walk = (node, depth) => {
      if (!node || depth > 12 || NON_CONTENT.has(node.tagName)) return;
      const kids = Array.from(node.children || []);
      if (kids.length >= 3) {
        const items = kids.filter(isItem);
        if (items.length >= 3) {
          const score = items.length * 1000 + depth * 5 - Math.abs(kids.length - items.length) * 8;
          if (score > bestScore) { bestScore = score; best = { node: node, count: items.length }; }
        }
      }
      for (const k of kids) walk(k, depth + 1);
    };
    walk(root, 0);
    const container = best ? best.node : root;
    const children = Array.from(container.children || []).filter(isItem);
    const seen = {}; const out = [];
    for (const el of children) {
      const r = rowOf(el);
      if (!r.text && !r.href) continue;
      const key = r.text + '|' + (r.href || '');
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(r);
      if (out.length >= limit) break;
    }
    return { kind: 'list', container: best ? { matched: best.count } : { matched: children.length }, count: out.length, rows: out };
`;

/**
 * When to use: extract() and observe(list|table|app_data).
 *
 * Each `kind` is its own page-side program, interpolated after the shared
 * bindings, so adding a kind means adding one constant.
 */
export function buildExtractScript(opts: ExtractOptions): string {
  return `(() => {
    const opts = ${JSON.stringify(opts)};
    ${PROBE_HELPERS}${EXTRACT_PRELUDE}${EXTRACT_APP_DATA}${EXTRACT_SCHEMA_ORG}${EXTRACT_TABLES}${EXTRACT_TABLE}${EXTRACT_LIST}
  })()`;
}

/** When to use: the collector — the bindings it shares with the list extractor. */
const COLLECT_PRELUDE = `
    const abs = (h) => { try { return new URL(h, location.href).href; } catch (e) { return h; } };
    const root = resolveRoot(opts.ref, opts.selector);
    if (!root) return { error: 'root not found', kind: 'list' };
    const max = opts.max && opts.max > 0 ? opts.max : 300;
    const step = opts.step && opts.step > 0 ? opts.step : 600;
    const delayMs = opts.delayMs && opts.delayMs > 0 ? opts.delayMs : 250;
    const maxScrolls = opts.maxScrolls && opts.maxScrolls > 0 ? opts.maxScrolls : 30;
    const sig = (el) => el.tagName + '|' + (typeof el.className === 'string' ? (el.className.split(/\\s+/).filter(Boolean)[0] || '') : '') + '|' + (el.getAttribute('role') || '') + '|' + el.children.length;
    const rowOf = (el) => {
      const a = el.matches && el.matches('a[href]') ? el : el.querySelector('a[href]');
      const markEl = el.getAttribute && el.getAttribute('data-mark-id') ? el : el.querySelector('[data-mark-id]');
      return {
        text: clean(el.innerText || el.textContent).slice(0, 400),
        href: a ? abs(a.getAttribute('href')) : undefined,
        aria: clean(el.getAttribute && el.getAttribute('aria-label')) || undefined,
        mark: markEl ? Number(markEl.getAttribute('data-mark-id')) : undefined
      };
    };
    // Same non-content guard as extract(list): a wall of inline <script> siblings must never
    // win, and rows are scored by content density so one sponsored card cannot break the match.
    const NON_CONTENT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'META', 'LINK', 'HEAD', 'TITLE', 'SVG', 'IFRAME', 'CANVAS']);
    const isContent = (el) => el && !NON_CONTENT.has(el.tagName) && isVisible(el);
    const isItem = (el) => isContent(el) && ((el.innerText || '').trim().length >= 25 || !!el.querySelector('a[href]'));
    let best = null; let bestScore = 0;
    const walk = (node, depth) => {
      if (!node || depth > 12 || NON_CONTENT.has(node.tagName)) return;
      const kids = Array.from(node.children || []);
      if (kids.length >= 3) {
        const items = kids.filter(isItem);
        if (items.length >= 3) {
          const score = items.length * 1000 + depth * 5 - Math.abs(kids.length - items.length) * 8;
          if (score > bestScore) { bestScore = score; best = { node: node, count: items.length }; }
        }
      }
      for (const k of kids) walk(k, depth + 1);
    };
    walk(root, 0);
    const container = best ? best.node : root;
`;

/** The scroll loop, its dedupe buffer and the diagnostic return. */
const COLLECT_SCROLL = `
    let rows = Array.from(container.children || []).filter(isItem);
    const target = opts.scroll === 'window' ? (document.scrollingElement || document.documentElement) : container;
    const seen = {}; const out = [];
    const read = () => {
      for (const el of rows) {
        const r = rowOf(el);
        if (!r.text && !r.href) continue;
        const key = r.text + '|' + (r.href || '');
        if (seen[key]) continue;
        seen[key] = 1;
        out.push(r);
      }
    };
    let scrolls = 0; let stall = 0;
    const startTop = target.scrollTop;
    for (let i = 0; i < maxScrolls && out.length < max; i++) {
      read();
      const before = out.length;
      try { target.scrollBy(0, step); } catch (e) {}
      await new Promise((r) => setTimeout(r, delayMs));
      rows = Array.from(container.children || []);
      if (best) { const f = rows.filter((el) => sig(el) === best.sig); if (f.length >= 3) rows = f; }
      read();
      scrolls = i + 1;
      if (out.length === before) { stall++; if (stall >= 3) break; } else { stall = 0; }
    }
    read();
    return {
      kind: 'list',
      count: out.length,
      scrolls: scrolls,
      diag: {
        startTop: startTop,
        scrollTop: target.scrollTop,
        scrollHeight: target.scrollHeight,
        clientHeight: target.clientHeight,
        children: (container.children || []).length,
        visibility: document.visibilityState,
        hasFocus: document.hasFocus(),
      },
      rows: out.slice(0, max),
    };
`;

/**
 * When to use: collect_all — the scroll-and-dedupe collector (bindings, then the loop).
 */
export function buildCollectScript(opts: CollectOptions): string {
  return `(async () => {
    const opts = ${JSON.stringify(opts)};
    ${PROBE_HELPERS}${COLLECT_PRELUDE}${COLLECT_SCROLL}
  })()`;
}
