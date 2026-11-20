/**
 * URL and link rules for the crawler: what counts as one page, what a pattern allows,
 * and which links a Markdown page actually offers.
 *
 * These are pure functions (no fetch, no state), so the BFS and the tests can share
 * exactly one definition of de-duplication and scoping.
 *
 * When to use: normalising a URL, testing `match_patterns`, or extracting links.
 */

/** Strips the fragment so `/a` and `/a#x` are one page. */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    return u.toString();
  } catch {
    return (raw || '').trim();
  }
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}`);
}

/** True when the URL matches any pattern (glob by default, `/regex/` when wrapped in slashes). */
export function matchesAnyPattern(url: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.pathname}${u.search}`;
  } catch {
    /* keep raw */
  }
  for (const p of patterns) {
    try {
      if (p.length > 2 && p.startsWith('/') && p.endsWith('/')) {
        if (new RegExp(p.slice(1, -1)).test(url)) return true;
      } else if (globToRegExp(p).test(p.startsWith('http') ? url : path)) {
        return true;
      }
    } catch {
      /* ignore a bad pattern */
    }
  }
  return false;
}

/** Extracts absolute links from Markdown (`[text](href)`), resolved against the page URL. */
export function linksFromMarkdown(markdown: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /\[[^\]]*\]\(([^)\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const href = m[1];
    if (!href || /^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    try {
      const abs = new URL(href, baseUrl).toString();
      if (/^https?:/i.test(abs)) out.add(normalizeUrl(abs));
    } catch {
      /* ignore */
    }
  }
  return Array.from(out);
}
