/**
 * The page-side candidate pass: walk every open shadow root, collect semantic controls and
 * the outermost pointer-cursor heuristics, then filter by visibility/occlusion and order
 * popup contents before on-screen items, and those before off-screen ones.
 *
 * When to use: composed by marksInjectionScript between the helpers and the numbering phase.
 */
export function marksCollect(): string {
  return `        // 1. Gather candidates (semantic first, then cursor:pointer heuristic).
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

        // 2. Filter (visibility + occlusion) and classify
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

        // 3. Popup contents first, then on-screen items, then off-screen items. Keeping visible
        // elements ahead of off-screen ones means the 99-mark cap never starves what you can see.
        items.sort((a, b) => {
          if (a.popup !== b.popup) return a.popup ? -1 : 1;
          if (a.onScreen !== b.onScreen) return a.onScreen ? -1 : 1;
          return 0;
        });

`;
}
