/**
 * The in-page Set-of-Marks injector.
 *
 * Why a module: the injector is one large page-side program — candidate
 * collection, visibility/occlusion filtering, sticky-anchor assignment and badge
 * painting. Keeping it beside the class that calls it made `injectMarks` a
 * 400-line method; the class now collects the inputs, runs the script and stores
 * the result.
 *
 * The script returns `{ marks, newStaticAnchors }`; nothing here talks to
 * Electron. The body is a plain template in ordered stages so each part can be
 * read on its own; the concatenation is byte-for-byte the script the page ran
 * before the split.
 */
import { DEEP_DOM_HELPERS } from '../primitives/dom-targeting.ts';
import { COMPONENT_SIGNATURE_HELPERS } from '../shadow-walk/component-signature.ts';

/** When to use: building one mark scan — the sticky anchors and the two scope flags. */
export interface MarksInjectorOptions {
  /** Fingerprint -> mark id, so a structural anchor keeps its number across scans. */
  existingAnchors: Record<string, number>;
  /** Also number elements outside the viewport (after popup and on-screen marks). */
  includeOffscreen: boolean;
  /** Traverse open shadow roots (default true). */
  deepOpenRoots: boolean;
}

/** The page-side helpers and the three per-scan values, in script order. */
function scriptPreamble({ existingAnchors, includeOffscreen, deepOpenRoots }: MarksInjectorOptions): string {
  return `
      (() => {${DEEP_DOM_HELPERS}${COMPONENT_SIGNATURE_HELPERS}
        const existingAnchors = ${JSON.stringify(existingAnchors)};
        const includeOffscreen = ${JSON.stringify(includeOffscreen)};
        const deepOpenRoots = ${JSON.stringify(deepOpenRoots)};
`;
}

/** Page-side stage 1 of 5: container and selectors. */
const MARK_SCAN_SETUP = `
        // Remove existing visual overlay container if present (leave data-mark-id for sticky cache)
        const old = document.getElementById('mark-eleven-som-container');
        if (old) old.remove();

        const container = document.createElement('div');
        container.id = 'mark-eleven-som-container';
        container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
        document.documentElement.appendChild(container);

        const SEMANTIC = 'a[href], button, input:not([type="hidden"]), select, textarea, details, summary, [contenteditable=""], [contenteditable="true"], [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="combobox"], [role="option"], [role="treeitem"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="slider"], [role="spinbutton"], [role="searchbox"], [role="textbox"], [aria-haspopup]:not([aria-haspopup="false"]), [aria-expanded], [onclick], [tabindex="0"]';
        const POPUP = '[role="listbox"], [role="menu"], [role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open], [role="tooltip"], [data-radix-popper-content-wrapper], [data-radix-portal], .MuiPopover-root, .MuiMenu-root, .ant-select-dropdown, .select2-dropdown';
        const STATIC_CONTAINERS = 'header, nav, footer, aside, form, [role="banner"], [role="navigation"], [role="search"], [role="toolbar"]';
        const DYNAMIC_CONTAINERS = '[aria-live], [role="feed"], [role="log"], [data-results], .results, tbody, .infinite-scroll';
        const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();

        // A hidden/minimized window reports innerHeight/innerWidth of 0, which would make the
        // viewport filter below reject every element and let list_marks() return nothing.
        // Fall back to the document box so marks still resolve when the window is off-screen.
        const vpW = window.innerWidth || document.documentElement.clientWidth || 0;
        const vpH = window.innerHeight || document.documentElement.clientHeight || 0;
        const canHitTest = vpW > 0 && vpH > 0;
        const boundW = vpW || document.documentElement.scrollWidth || 0;
        const boundH = vpH || document.documentElement.scrollHeight || 0;

        const isVisible = (el, rect) => {
          if (rect.width < 6 || rect.height < 6) return false;
          // When includeOffscreen is off, reject anything outside the (best-known) viewport.
          if (!includeOffscreen) {
            if (rect.bottom < 0 || rect.top > boundH) return false;
            if (rect.right < 0 || rect.left > boundW) return false;
          }
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          // Composed ancestors: a control inside a closed-away panel inside a shadow root
          // is hidden just the same as one in the light DOM.
          if (kqClosest(el, '[aria-hidden="true"], [hidden], [inert]')) return false;
          return true;
        };

        // Accessible-name computation (simplified)
        const accName = (el) => {
          let n = clean(el.getAttribute('aria-label'));
          if (n) return n;
          const lb = el.getAttribute('aria-labelledby');
          if (lb) {
            n = clean(lb.split(/\\s+/).map((id) => {
              const t = document.getElementById(id);
              return t ? (t.innerText || t.textContent || '') : '';
            }).join(' '));
            if (n) return n;
          }
          if (el.labels && el.labels.length) {
            n = clean(Array.from(el.labels).map((l) => l.innerText || l.textContent || '').join(' '));
            if (n) return n;
          }
          // A submit/button input's visible label is its value attribute, not its name
          // (GitHub's submit is name="commit" value="Sign in" — "commit" is meaningless).
          const inputType = (el.getAttribute('type') || '').toLowerCase();
          if (el.tagName === 'INPUT' && ['submit', 'button', 'reset'].includes(inputType)) {
            n = clean(el.getAttribute('value'));
            if (n) return n;
          }
          n = clean(el.innerText);
          if (n) return n;
          const isPassword = (el.getAttribute('type') || '').toLowerCase() === 'password';
          for (const attr of ['placeholder', 'title', 'alt', 'name']) {
            n = clean(el.getAttribute(attr));
            if (n) return n;
          }
          if (!isPassword) {
            n = clean(el.getAttribute('value'));
            if (n) return n;
          }
          const inner = el.querySelector('img[alt], svg title, [aria-label]');
          if (inner) {
            n = clean(inner.getAttribute('alt') || inner.getAttribute('aria-label') || inner.textContent);
            if (n) return n;
          }
          return '';
        };

        // ARIA / widget state flags
        const stateOf = (el) => {
          const s = [];
          const a = (name) => el.getAttribute(name);
          if (el.disabled || a('aria-disabled') === 'true') s.push('disabled');
          if (a('aria-expanded') !== null) s.push('expanded=' + a('aria-expanded'));
          if (el.checked === true || a('aria-checked') === 'true') s.push('checked');
          else if (a('aria-checked') === 'mixed') s.push('checked=mixed');
          if (a('aria-selected') === 'true') s.push('selected');
          if (a('aria-pressed') !== null) s.push('pressed=' + a('aria-pressed'));
          if (a('aria-current') && a('aria-current') !== 'false') s.push('current');
          if (el.required || a('aria-required') === 'true') s.push('required');
          if (a('aria-invalid') === 'true') s.push('invalid');
          if (a('aria-haspopup') && a('aria-haspopup') !== 'false') s.push('haspopup=' + a('aria-haspopup'));
          if (el.readOnly) s.push('readonly');
          return s.join(',');
        };

        // Affordances: what this component actually accepts. A disabled control offers
        // nothing. This is what lets a decision head offer only compatible targets —
        // a CLICK question never contains a textbox. (Idea borrowed from browser-use's
        // jev-ultrafast "dynamic action space".)
        const actionsOf = (el) => {
          const a = (n) => el.getAttribute(n);
          if (el.disabled || a('aria-disabled') === 'true' || a('inert') !== null) return [];
          const tag = el.tagName.toLowerCase();
          const type = (a('type') || '').toLowerCase();
          const role = (a('role') || '').toLowerCase();
          const out = [];
          const editable =
            (tag === 'input' && !['checkbox', 'radio', 'button', 'submit', 'reset', 'hidden', 'file', 'image', 'range', 'color'].includes(type)) ||
            tag === 'textarea' ||
            el.isContentEditable === true ||
            role === 'textbox' ||
            role === 'searchbox' ||
            role === 'combobox' ||
            role === 'spinbutton';
          if (editable) out.push('type');
          if (tag === 'select') out.push('select');
          const clickable =
            tag === 'a' || tag === 'button' || tag === 'summary' || tag === 'select' ||
            // A label associated with a control (radio, checkbox, sort toggle) is how a human clicks it.
            (tag === 'label' && (el.control || el.htmlFor || el.querySelector('input, select, textarea'))) ||
            ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image'].includes(type) ||
            ['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'treeitem'].includes(role) ||
            (a('aria-haspopup') && a('aria-haspopup') !== 'false') ||
            a('aria-expanded') !== null;
          if (clickable) out.push('click');
          if (!out.length) out.push('hover');
          return out;
        };

        // Nearest landmark, composed (so a control inside a shadow-rooted <form> or
        // dialog lands in the right group instead of "page").
        const LANDMARK = 'header, nav, main, aside, footer, form, dialog, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"], [role="dialog"], [role="alertdialog"], [role="search"], [role="form"], [role="region"]';
        const regionOf = (el) => {
          const lm = kqClosest(el, LANDMARK);
          if (!lm) return { region: 'page', regionName: undefined };
          const tag = lm.tagName.toLowerCase();
          const role = (lm.getAttribute('role') || tag).toLowerCase();
          let name = kqLabel(lm);
          if (!name) {
            const h = lm.querySelector('h1, h2, h3, legend, [aria-label]');
            name = h ? clean(h.getAttribute('aria-label') || h.textContent) : '';
          }
          return { region: role, regionName: name ? name.slice(0, 40) : undefined };
        };

        const valueOf = (el) => {          const tag = el.tagName.toUpperCase();
          if ((el.getAttribute('type') || '').toLowerCase() === 'password') return undefined;
          let v;
          if (tag === 'SELECT') {
            const opt = el.options && el.options[el.selectedIndex];
            v = opt ? opt.text : '';
          } else if (tag === 'INPUT' || tag === 'TEXTAREA') {
            const t = (el.getAttribute('type') || 'text').toLowerCase();
            if (t === 'checkbox' || t === 'radio' || t === 'button' || t === 'submit') return undefined;
            v = el.value;
          } else if (el.getAttribute('aria-valuenow') !== null) {
            v = el.getAttribute('aria-valuenow');
          } else {
            return undefined;
          }
          v = clean(v);
          return v ? v.slice(0, 50) : undefined;
        };

        // Determine if an element is a structural static anchor vs dynamic feed/result item
        const isStaticAnchor = (el) => {
          // If explicitly in a dynamic container, treat as dynamic
          if (kqClosest(el, DYNAMIC_CONTAINERS)) return false;
          // Structural layout elements: nav, header, footer, search form
          if (kqClosest(el, STATIC_CONTAINERS)) return true;
          // Fixed/sticky headers or toolbars
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' || style.position === 'sticky') return true;
          // Elements with deterministic DOM IDs or names
          if (el.id && !/\\d{5,}/.test(el.id)) return true;
          if (el.name) return true;
          return false;
        };

        // Computes a deterministic fingerprint for stable anchor matching
        const computeFingerprint = (el, label) => {
          const id = el.id ? '#' + el.id : '';
          const name = el.name ? '[name=' + el.name + ']' : '';
          const role = el.getAttribute('role') || '';
          const href = (el.getAttribute('href') || '').split('?')[0];
          return [el.tagName, id, name, role, label, href].filter(Boolean).join('|');
        };

`;

/** Page-side stage 2 of 5: candidate collection (semantic + pointer heuristic). */
const MARK_SCAN_COLLECT = `        // 1. Gather candidates (semantic first, then cursor:pointer heuristic).
        // Walks every open shadow root: a web-component control is a real, clickable thing
        // and was previously invisible to Set-of-Marks entirely (0 marks on a signup form).
        const seen = new Set();
        const candidates = [];
        const roots = [];
        const collectRoots = (root) => {
          roots.push(root);
          if (!deepOpenRoots) return;
          for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) collectRoots(el.shadowRoot);
          }
        };
        collectRoots(document);

        for (const root of roots) {
          for (const el of root.querySelectorAll(SEMANTIC)) {
            if (seen.has(el)) continue;
            seen.add(el);
            candidates.push(el);
          }
        }
        let scanned = 0;
        for (const root of roots) {
          for (const el of root.querySelectorAll('div, span, li, td, img, svg, label, i, p')) {
            if (++scanned > 4000) break;
            if (seen.has(el) || el.id === 'mark-eleven-som-container' || kqClosest(el, '#mark-eleven-som-container')) continue;
            if (kqClosest(el, SEMANTIC)) continue; // already covered by a semantic ancestor
            const style = window.getComputedStyle(el);
            if (style.cursor !== 'pointer') continue;
            const parent = kqComposedParent(el);
            if (parent && window.getComputedStyle(parent).cursor === 'pointer') continue; // outermost only
            seen.add(el);
            candidates.push(el);
          }
        }

`;

/** Page-side stage 3 of 5: visibility, occlusion and popup classification. */
const MARK_SCAN_FILTER = `        // 2. Filter (visibility + occlusion) and classify
        const items = [];
        for (const el of candidates) {
          const rect = el.getBoundingClientRect();
          if (!isVisible(el, rect)) continue;
          const onScreen = rect.bottom > 0 && rect.top < boundH && rect.right > 0 && rect.left < boundW;
          if (onScreen && canHitTest) {
            // Hit-test the CENTRE OF THE VISIBLE PART, not the centre of the whole rect clamped to
            // the viewport edge. A tall card (taller than the viewport) has its geometric centre
            // off-screen; clamping that to y=viewport-height lands on a sticky footer and the
            // element was discarded as "covered" — which is why full-width result cards on
            // Mobalytics never received a mark.
            const left = Math.max(rect.left, 0);
            const right = Math.min(rect.right, vpW);
            const top = Math.max(rect.top, 0);
            const bottom = Math.min(rect.bottom, vpH);
            if (right > left && bottom > top) {
              const cx = Math.round((left + right) / 2);
              const cy = Math.round((top + bottom) / 2);
              // Deepest hit-test: for shadow content, elementFromPoint returns the host, so a
              // plain comparison would treat every shadow control as "occluded" and drop it.
              const hit = kqAtPoint(cx, cy);
              if (hit && hit !== el && !kqContainsComposed(el, hit) && !kqContainsComposed(hit, el)) continue; // covered by something else
            }
          }
          const popup = !!kqClosest(el, POPUP);
          const isStatic = isStaticAnchor(el);
          items.push({ el, rect, popup, isStatic, onScreen });
        }

`;

/** Page-side stage 4 of 5: stable id assignment (sticky anchors first). */
const MARK_SCAN_ASSIGN = `        // 3. Popup contents first, then on-screen items, then off-screen items. Keeping visible
        // elements ahead of off-screen ones means the 99-mark cap never starves what you can see.
        items.sort((a, b) => {
          if (a.popup !== b.popup) return a.popup ? -1 : 1;
          if (a.onScreen !== b.onScreen) return a.onScreen ? -1 : 1;
          return 0;
        });

`;

/** Page-side stage 5 of 5: badge painting and the mark records. */
const MARK_SCAN_PAINT = `        // 4. Stable assignment: Reserve numbers for sticky static anchors first
        const usedIds = new Set();
        const assignments = [];
        const newStaticAnchors = {};

        // Pass A: Check existing sticky anchors or previously stamped data-mark-id
        for (const item of items) {
          const label = accName(item.el).slice(0, 50);
          const fp = computeFingerprint(item.el, label);
          let assignedId = null;

          const existingMarkAttr = item.el.getAttribute('data-mark-id');
          if (existingMarkAttr && !isNaN(Number(existingMarkAttr))) {
            assignedId = Number(existingMarkAttr);
            usedIds.add(assignedId);
            if (item.isStatic) newStaticAnchors[fp] = assignedId;
          } else if (item.isStatic && existingAnchors[fp]) {
            assignedId = existingAnchors[fp];
            usedIds.add(assignedId);
            newStaticAnchors[fp] = assignedId;
          }
          assignments.push({ ...item, label, fp, assignedId });
        }

        // Pass B: Allocate IDs for new items sequentially
        let nextSeqId = 1;
        const getNextAvailableId = () => {
          while (usedIds.has(nextSeqId)) {
            nextSeqId++;
          }
          usedIds.add(nextSeqId);
          return nextSeqId;
        };

        const marks = [];
        for (const item of assignments) {
          let markId = item.assignedId;
          if (markId === null) {
            markId = getNextAvailableId();
            if (item.isStatic) {
              newStaticAnchors[item.fp] = markId;
            }
          }

          if (markId > 99) continue; // Respect 99 mark ceiling for token efficiency

          const { el, rect, label } = item;
          const state = stateOf(el);
          const value = valueOf(el);
          const actions = actionsOf(el);
          const { region, regionName } = regionOf(el);
          const disabled = state.split(',').includes('disabled');

          el.setAttribute('data-mark-id', String(markId));

          // Create badge element
          const badge = document.createElement('div');
          badge.className = 'mark-eleven-badge';
          badge.textContent = String(markId);
          badge.style.cssText = \`
            position: fixed;
            top: \${Math.max(0, rect.top)}px;
            left: \${Math.max(0, rect.left)}px;
            background: \${disabled ? '#a1a1aa' : item.isStatic ? '#06b6d4' : '#eab308'};
            color: #09090b;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 11px;
            font-weight: 800;
            line-height: 1;
            padding: 2px 4px;
            border-radius: 3px;
            box-shadow: 0 0 6px rgba(0, 0, 0, 0.9), 0 0 10px \${item.isStatic ? 'rgba(6, 182, 212, 0.6)' : 'rgba(234, 179, 8, 0.6)'};
            border: 1px solid \${disabled ? '#71717a' : item.isStatic ? '#0891b2' : '#ca8a04'};
            pointer-events: none;
            z-index: 2147483647;
          \`;

          // Subtle box outline
          const box = document.createElement('div');
          box.style.cssText = \`
            position: fixed;
            top: \${rect.top}px;
            left: \${rect.left}px;
            width: \${rect.width}px;
            height: \${rect.height}px;
            border: 1px dashed \${disabled ? 'rgba(161, 161, 170, 0.7)' : item.isStatic ? 'rgba(6, 182, 212, 0.7)' : 'rgba(234, 179, 8, 0.7)'};
            pointer-events: none;
            box-sizing: border-box;
            z-index: 2147483646;
          \`;

          container.appendChild(box);
          container.appendChild(badge);

          marks.push({
            id: markId,
            tag: el.tagName.toUpperCase(),
            type: (el.getAttribute('type') || '').toLowerCase() || undefined,
            text: label,
            role: el.getAttribute('role') || undefined,
            state: state || undefined,
            value,
            actions,
            region,
            regionName,
            rect: {
              x: Math.round(rect.left),
              y: Math.round(rect.top),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
            center: {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            },
            component: kqComponentSurface(el) || undefined,
          });
        }

        return { marks, newStaticAnchors };
      })()
    `;

/** When to use: `MarksOverlay.injectMarks` — renders the page-side Set-of-Marks scan. */
export function marksInjectorScript(options: MarksInjectorOptions): string {
  return (
    scriptPreamble(options) +
    MARK_SCAN_SETUP +
    MARK_SCAN_COLLECT +
    MARK_SCAN_FILTER +
    MARK_SCAN_ASSIGN +
    MARK_SCAN_PAINT
  );
}
