/**
 * The scripts the marks overlay injects into a page.
 *
 * Both are strings because they run in the page, not in the app. The badge script is built
 * from three page-side phases — helpers, candidate collection, numbering/drawing — so each
 * one can be read on its own; the lookup script re-measures one mark by id.
 *
 * When to use: MarksOverlay.injectMarks / getMarkTarget. Interpolated values are the only
 * inputs; the deep-DOM and component helpers are prepended so the page can walk shadow roots.
 */
import { DEEP_DOM_HELPERS } from '../primitives/dom-targeting.js';
import { COMPONENT_SIGNATURE_HELPERS } from '../shadow-walk/component-signature.js';
import { marksPrelude } from './injected-helpers.js';
import { marksCollect } from './injected-collect.js';
import { marksAssign } from './injected-assign.js';

/** When to use: before injecting badges — the page-side scan and numbering pass. */
export function marksInjectionScript(input: {
  existingAnchors: Record<string, number>;
  includeOffscreen: boolean;
  deepOpenRoots: boolean;
}): string {
  return `(() => {${DEEP_DOM_HELPERS}${COMPONENT_SIGNATURE_HELPERS}${marksPrelude(input)}${marksCollect()}${marksAssign()}
      })()`;
}

/** When to use: resolving one mark id to live coordinates and identity in the page. */
export function markLookupScript(markId: number): string {
  return `
          (() => {${DEEP_DOM_HELPERS}
            // Shadow-aware: a mark stamped on a web-component control lives inside its
            // shadow root, where document.querySelector cannot see it.
            const el = kqDeep('[data-mark-id="${markId}"]');
            if (!el) return null;
            let rect = el.getBoundingClientRect();
            const offscreen = rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth;
            if (offscreen) {
              // Marks created with include_offscreen may sit above/below the fold; bring them
              // into view so the humanised click lands on real pixels. Instant (non-smooth) so
              // the re-measured centre below is already final.
              try { el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); } catch {}
              rect = el.getBoundingClientRect();
            }
            // A large card link's centre is often covered by a nested overlay; click a point that
            // belongs to the element instead (kqSafePoint tries several offsets).
            const point = kqSafePoint(el);
            const rect = el.getBoundingClientRect();
            // Live identity, so a mark that outlived the cached table still reports what it is
            // instead of a faceless "ELEMENT". Cheap: same round trip as the coordinates.
            const name = (
              (el.getAttribute && el.getAttribute('aria-label')) ||
              (el.innerText || el.textContent || '').replace(/\\s+/g, ' ').trim()
            ).slice(0, 90);
            return {
              x: point.x, y: point.y, covered: point.covered === true,
              tag: (el.tagName || 'ELEMENT').toUpperCase(), name,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            };          })()
        `;
}
