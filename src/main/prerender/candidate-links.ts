/**
 * The candidate link extractor for `prerender_links`.
 *
 * Why a module: the choice of which links to warm is a page-side heuristic —
 * result links first, then main-content anchors — and it is the only place in
 * the prerender path that runs in the page. Keeping it out of the engine means
 * the extraction is one readable script instead of a string inside a method.
 */
import type { WebContents } from 'electron';

/** When to use: `prerender` without an explicit URL list — top outgoing links. */
export async function extractCandidateLinks(
  wc: WebContents,
  selector?: string,
  limit: number = 3,
): Promise<string[]> {
  const script = `
      (() => {
        const sel = ${selector ? JSON.stringify(selector) : 'null'};
        let elements = [];
        if (sel) {
          elements = Array.from(document.querySelectorAll(sel));
        } else {
          // Heuristic: search result links, navigation anchors, main content links
          const candidates = document.querySelectorAll('main a[href], article a[href], .search a[href], [role="main"] a[href], a[href]');
          elements = Array.from(candidates);
        }

        const seen = new Set();
        const urls = [];

        for (const el of elements) {
          const href = el.href;
          if (!href || href.startsWith('javascript:') || href.includes('#')) continue;
          if (!/^https?:\\/\\//i.test(href)) continue;
          if (href === window.location.href) continue;

          if (!seen.has(href)) {
            seen.add(href);
            urls.push(href);
            if (urls.length >= ${limit}) break;
          }
        }
        return urls;
      })()
    `;
  try {
    const res = await wc.executeJavaScript(script);
    return Array.isArray(res) ? res : [];
  } catch {
    return [];
  }
}
