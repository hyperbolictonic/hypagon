/**
 * Citation anchors.
 *
 * A highlight extracted from Markdown is just text — when the site is redesigned it silently
 * points at nothing. Anchoring finds the DOM block that produced each highlight and stores its
 * fingerprint, so a later run can relocate it (`Page.relocate`) and report a score.
 */
import { Page, ratio, similarityScore } from 'hypagon-scrap';
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

export interface CitationCandidate {
  score: number;
  /** Similarity of the candidate's own text to the anchored text (0-1). */
  textScore: number;
  path: string;
  text: string;
}

export interface CitationRelocation {
  found: boolean;
  score: number | null;
  path: string | null;
  text: string | null;
  candidates: CitationCandidate[];
  error?: string;
}

/**
 * Revalidate a stored anchor against fresh HTML.
 *
 * Mirrors `Page.relocate` (descendants only, rounded scores) but returns the ranked candidates so
 * the caller can see a near-miss after a redesign instead of a bare false.
 */
export async function relocateCitation(
  html: string,
  fingerprint: Fingerprint,
  threshold = 40,
  maxCandidates = 3,
  minTextScore = 0.5,
): Promise<CitationRelocation> {
  if (!html) {
    return { found: false, score: null, path: null, text: null, candidates: [], error: 'empty document' };
  }

  let page;
  try {
    page = await Page.load(html);
  } catch (err: any) {
    return {
      found: false,
      score: null,
      path: null,
      text: null,
      candidates: [],
      error: `parse failed: ${err?.message || err}`,
    };
  }

  try {
    const index = page.index;
    const anchoredText =
      typeof fingerprint.text === 'string' && fingerprint.text.trim().length >= 20
        ? fingerprint.text.replace(/\s+/g, ' ').trim()
        : '';

    const scored: Array<{ i: number; score: number; textScore: number }> = [];
    for (let i = 1; i < index.size; i++) {
      const node = index.node(i);
      const own = (node.ownText || node.text).replace(/\s+/g, ' ').trim();
      scored.push({
        i,
        score: similarityScore(index, fingerprint, i),
        textScore: anchoredText ? ratio(anchoredText, own) : 1,
      });
    }
    scored.sort((a, b) => b.score - a.score);

    const candidates = scored.slice(0, maxCandidates).map(({ i, score, textScore }) => ({
      score,
      textScore,
      path: index.node(i).path,
      text: index.node(i).text.replace(/\s+/g, ' ').trim().slice(0, 320),
    }));

    // Structural similarity alone can point at a different paragraph after a deletion; require
    // the anchored text to still resemble the candidate when we have enough text to judge.
    const matches = scored.filter(
      (entry) => entry.score >= threshold && (!anchoredText || entry.textScore >= minTextScore),
    );
    const top = matches[0];
    const found = Boolean(top);
    const topNode = found ? index.node(top.i) : null;

    return {
      found,
      score: found ? top.score : (scored[0]?.score ?? null),
      path: topNode ? topNode.path : null,
      text: topNode ? topNode.text.replace(/\s+/g, ' ').trim().slice(0, 320) : null,
      candidates,
    };
  } finally {
    page.dispose();
  }
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
