/**
 * Citation anchors.
 *
 * A highlight extracted from Markdown is just text — when the site is redesigned it silently
 * points at nothing. Anchoring finds the DOM block that produced each highlight and stores its
 * fingerprint, so a later run can relocate it (`Page.relocate`) and report a score.
 */
import { Page } from 'hypagon-scrap';
import type { Fingerprint } from 'hypagon-scrap';

export interface CitationAnchor {
  /** Human-readable excerpt, capped for result size. */
  text: string;
  /** Query-term overlap used to rank candidates. */
  score: number;
  /** XPath at extraction time, for display/debugging (not the matching key). */
  path: string;
  /** Plain-JSON fingerprint; survives a database round-trip. */
  fingerprint: Fingerprint;
}

const BLOCK_XPATH = '//p | //li | //h2 | //h3 | //h4 | //blockquote | //td';
const MAX_HTML_BYTES = 2_000_000;
const MIN_TEXT = 60;
const MAX_TEXT = 2000;

export async function anchorHighlights(
  html: string,
  query: string,
  max = 5,
): Promise<CitationAnchor[]> {
  if (!html || html.length > MAX_HTML_BYTES) return [];

  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
  if (terms.length === 0) return [];

  let page;
  try {
    page = await Page.load(html);
  } catch {
    return [];
  }

  try {
    const seen = new Set<string>();
    const anchors: CitationAnchor[] = [];

    for (const node of page.xpath(BLOCK_XPATH)) {
      const text = node
        .getAllText({ separator: ' ' })
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length < MIN_TEXT || text.length > MAX_TEXT) continue;

      const key = text.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);

      const low = text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (low.includes(term) ? 1 : 0), 0);
      if (score === 0) continue;

      anchors.push({
        text: text.slice(0, 320),
        score,
        path: node.path,
        fingerprint: node.fingerprint(),
      });
    }

    anchors.sort((a, b) => b.score - a.score);
    return anchors.slice(0, max);
  } finally {
    page.dispose();
  }
}
