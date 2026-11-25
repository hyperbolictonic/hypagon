/**
 * Reads the Markdown/Text alternates a live page advertises.
 *
 * Why a module: the in-page script, the dedupe and the trust ranking are one
 * job. The page probe only needs `{ links, ready }`, and the ranking rules
 * (declared `<link>` first, then this page's own `.md`/`.txt` sibling, then
 * same-origin anchors, then cross-origin) are easier to read on their own.
 *
 * The page is only ever asked what it *offers* — a declared
 * `<link rel="alternate">` or a real `<a href="….md|.txt">`. No path is ever
 * constructed or guessed.
 */
import type { WebContents } from 'electron';
import type { LlmSurfaceLink } from './surface-types.js';
import { MARKDOWN_LINK_RE, TEXT_LINK_RE } from './surface-types.js';

interface RawLink {
  href: string;
  type: string;
  rel: string;
  source: 'link' | 'anchor';
}

interface Candidate {
  link: LlmSurfaceLink;
  rank: number;
}

function isMarkdown(link: { type: string; href: string }): boolean {
  return MARKDOWN_LINK_RE.test(link.type + ' ' + link.href);
}

function isText(link: { type: string; href: string }): boolean {
  return link.type === 'text/plain' || TEXT_LINK_RE.test(link.href);
}

/**
 * Rank one candidate so the most trustworthy wins: a declared `<link>` first,
 * then this page's own ".md/.txt" sibling, then other same-origin anchors, then
 * cross-origin ones.
 */
function rankAlternate(link: LlmSurfaceLink, page: URL | null): number {
  if (link.source === 'link') return 0;
  let rank = 100;
  try {
    const href = new URL(link.href);
    if (!page || href.origin !== page.origin) return rank + 60;
    const sibling = page.pathname.replace(/\/$/, '') + (isMarkdown(link) ? '.md' : '.txt');
    if (href.pathname === sibling) {
      link.page_level = true;
      return rank - 50;
    }
    return rank + 10;
  } catch {
    return rank + 80;
  }
}

/** When to use: `SurfaceProbe.probePage` — the live page's declared/anchored alternates. */
export async function readAlternates(wc: WebContents): Promise<{ links: LlmSurfaceLink[]; ready: boolean }> {
  // `ready` is false while the document is still parsing, so the caller can avoid
  // caching an empty result read from a half-loaded page.
  const script = `(() => {
    const out = [];
    const push = (href, type, rel, source) => { if (href) out.push({ href, type: (type || '').toLowerCase(), rel: (rel || '').toLowerCase(), source }); };
    for (const l of document.querySelectorAll('link[rel~="alternate"]')) {
      push(l.href, l.getAttribute('type'), l.getAttribute('rel'), 'link');
    }
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.href || '';
      if (!/^https?:/i.test(href)) continue;
      if (!/\\.md($|[?#])/i.test(href) && !/\\.txt($|[?#])/i.test(href)) continue;
      push(href, '', a.getAttribute('rel'), 'anchor');
    }
    return { ready: document.readyState !== 'loading', links: out };
  })()`;

  const raw = await wc.executeJavaScript(script).catch(() => null);
  const rawLinks: RawLink[] = Array.isArray((raw as any)?.links) ? (raw as any).links : [];
  const ready = (raw as any)?.ready !== false;

  let page: URL | null = null;
  try {
    page = new URL(wc.getURL?.() || '');
  } catch {
    page = null;
  }

  const seen = new Set<string>();
  const candidates: Candidate[] = [];

  for (const rawLink of rawLinks) {
    const href = String(rawLink?.href || '');
    if (!href || seen.has(href)) continue;
    const source: 'link' | 'anchor' = rawLink?.source === 'link' ? 'link' : 'anchor';
    const link: LlmSurfaceLink = {
      href,
      type: String(rawLink?.type || ''),
      rel: String(rawLink?.rel || 'alternate'),
      source,
      page_level: source === 'link',
    };
    if (!isMarkdown(link) && !isText(link)) continue;

    seen.add(href);
    candidates.push({ link, rank: rankAlternate(link, page) });
  }

  candidates.sort((a, b) => a.rank - b.rank);
  return { links: candidates.slice(0, 10).map((c) => c.link), ready };
}
