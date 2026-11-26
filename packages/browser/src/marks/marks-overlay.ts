import type { BrowserTarget } from '../target.ts';
import { DEEP_DOM_HELPERS } from '../primitives/dom-targeting.ts';
import type { ComponentSurface } from '../shadow-walk/component-signature.ts';
import { marksInjectorScript } from './inject-script.ts';
import type { HostMark } from '../primitives/contracts.ts';

/** When to use: one Set-of-Marks badge — the portable HostMark shape. */
export type MarkItem = HostMark;

/** When to use: stamping and resolving marks on a view — the active set plus sticky structural anchors. */
export class MarksOverlay {
  private activeMarks: Map<number, MarkItem> = new Map();
  /** Session-sticky registry for structural anchors: fingerprint -> markId */
  private staticAnchorMap: Map<string, number> = new Map();
  private lastUrl: string = '';

  /**
   * Resets sticky anchor cache when navigating to an entirely new page origin/path.
   */
  public resetIfUrlChanged(currentUrl: string): void {
    try {
      const cleanUrl = currentUrl.split('?')[0].split('#')[0].toLowerCase();
      if (this.lastUrl && this.lastUrl !== cleanUrl) {
        this.staticAnchorMap.clear();
      }
      this.lastUrl = cleanUrl;
    } catch {
      this.staticAnchorMap.clear();
    }
  }

  /**
   * Scans the active WebContents DOM for visible interactive elements,
   * injects neon visual badges ([1], [2], [3]...), and returns structured mark metadata.
   *
   * Detection layers:
   *  1. Semantic HTML + ARIA roles (button, link, combobox, option, menuitem, switch, ...).
   *  2. ARIA state attributes (aria-haspopup, aria-expanded) for custom widgets.
   *  3. A `cursor: pointer` heuristic for framework-built clickable <div>/<span> widgets
   *     that carry no role at all (outermost pointer element only).
   * Elements covered by something else (modals, open dropdown panels) are skipped via an
   * elementFromPoint occlusion check, and elements inside open popups are numbered first so
   * dropdown options are never crowded out by the 99-mark cap.
   * Labels use the accessible-name algorithm (aria-label, aria-labelledby, <label>, text, alt...).
   *
   * @param opts.includeOffscreen Also mark elements outside the current viewport (above/below the
   *   fold). Off-screen items are numbered *after* popup and on-screen items so the 99-mark cap
   *   still favours what is visible. Intended for long virtualized result lists; `click_mark`
   *   scrolls the target into view before clicking.
   * @param opts.deepOpenRoots Traverse open shadow roots (default true). Set false to keep marks
   *   to the light DOM; the Shadow Walk setting uses this.
   */
  public async injectMarks(
    target: BrowserTarget,
    opts: { includeOffscreen?: boolean; deepOpenRoots?: boolean } = {},
  ): Promise<MarkItem[]> {
    if (!target) return [];

    const currentUrl = target.url();
    this.resetIfUrlChanged(currentUrl);

    // Pass existing static anchors so the injected script can reuse sticky IDs
    const existingAnchors = Object.fromEntries(this.staticAnchorMap.entries());
    const includeOffscreen = opts.includeOffscreen === true;
    const deepOpenRoots = opts.deepOpenRoots !== false;

    const script = marksInjectorScript({ existingAnchors, includeOffscreen, deepOpenRoots });

    try {
      const res: { marks: MarkItem[]; newStaticAnchors: Record<string, number> } = await target.evaluate(script);
      const marks = res?.marks || [];
      const newAnchors = res?.newStaticAnchors || {};

      // Update sticky static anchor registry
      for (const [fp, id] of Object.entries(newAnchors)) {
        this.staticAnchorMap.set(fp, id);
      }

      this.activeMarks.clear();
      for (const m of marks) {
        this.activeMarks.set(m.id, m);
      }
      return marks;
    } catch (err: any) {
      console.warn(`[MarksOverlay] Failed to inject marks: ${err?.message || err}`);
      return [];
    }
  }

  /**
   * Cleans up the ephemeral visual badges and outline boxes from the DOM viewport.
   * NOTE: Retains the data-mark-id attribute on the interactive DOM elements so that
   * subsequent click_mark and type_mark calls can continue tracking shifted coordinates
   * dynamically without needing a fresh screenshot!
   */
  public async removeMarks(target: BrowserTarget): Promise<void> {
    if (!target) return;
    try {
      await target.evaluate(`
        (() => {
          const old = document.getElementById('mark-eleven-som-container');
          if (old) old.remove();
        })()
      `);
    } catch {}
  }

  /**
   * Gets mark metadata and current coordinates for a specific mark ID.
   */
  public async getMarkTarget(target: BrowserTarget, markId: number): Promise<{ mark: MarkItem; currentCenter: { x: number; y: number } } | null> {
    const cached = this.activeMarks.get(markId);

    // Query live coordinates from DOM in case page has scrolled slightly
    if (target) {
      try {
        const liveInfo = await target.evaluate<{
          x: number;
          y: number;
          covered: boolean;
          tag: string;
          name: string;
          rect: { x: number; y: number; width: number; height: number };
        } | null>(`
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
        `);
        if (liveInfo) {
          return {
            mark: cached || {
              id: markId,
              tag: liveInfo.tag || 'ELEMENT',
              text: liveInfo.name || '',
              rect: liveInfo.rect || { x: liveInfo.x, y: liveInfo.y, width: 0, height: 0 },
              center: { x: liveInfo.x, y: liveInfo.y },
            },
            currentCenter: { x: liveInfo.x, y: liveInfo.y },
          };
        }
      } catch {}
    }

    if (cached) {
      return { mark: cached, currentCenter: cached.center };
    }

    return null;
  }

  /**
   * Returns list of currently buffered marks.
   */
  public getActiveMarks(): MarkItem[] {
    return Array.from(this.activeMarks.values());
  }
}
