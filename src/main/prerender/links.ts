/**
 * Prerender link discovery and URL canonicalisation.
 *
 * The engine needs two things that are not about pools or views: which links on the
 * current page are worth warming, and one canonical spelling of a URL so a search
 * order change cannot cause a cache miss (while filters still keep pages distinct).
 *
 * When to use: extracting candidate links from a page, or normalising a URL for the
 * prerender pool. Keep the heuristics here, not in the engine.
 */

import type { WebContents } from 'electron';

/**
 * When to use: picking the top outgoing links on the active page. Uses the selector
 * when given, otherwise semantic link heuristics; failures yield an empty list.
 */
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

      const currentOrigin = window.location.origin;
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

/**
 * When to use: canonicalising a URL for the prerender pool — sorted query parameters,
 * lower-cased origin/path, trailing slashes dropped; unparseable input is trimmed.
 */
export function normalizePrerenderUrl(url: string): string {
  try {
    const u = new URL(url);
    // Canonicalize query parameters so search order doesn't cause cache misses,
    // while preserving distinct filter/query states so filtered pages never collide with base pages.
    const params = new URLSearchParams(u.search);
    params.sort();
    const queryString = params.toString();
    const basePath = `${u.origin}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
    return queryString ? `${basePath}?${queryString}` : basePath;
  } catch {
    return url.trim().toLowerCase();
  }
}
