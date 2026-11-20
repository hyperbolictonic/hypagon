/**
 * The page-side helpers the badge scan relies on: viewport bounds, visibility, accessible
 * names, widget state, affordances, landmarks, values and the static-anchor fingerprint.
 *
 * When to use: composed by marksInjectionScript before the collection and numbering phases.
 */
export function marksPrelude(input: {
  existingAnchors: Record<string, number>;
  includeOffscreen: boolean;
  deepOpenRoots: boolean;
}): string {
  return `
        const existingAnchors = ${JSON.stringify(input.existingAnchors)};
        const includeOffscreen = ${JSON.stringify(input.includeOffscreen)};
        const deepOpenRoots = ${JSON.stringify(input.deepOpenRoots)};

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
}
