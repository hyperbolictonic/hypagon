/**
 * The prerender pool's URL key.
 *
 * Why a module: `has`, `consume` and the navigation surface must agree on when
 * two URLs are "the same page". One canonicaliser keeps that decision in one
 * place.
 */

/** When to use: comparing a requested URL to a pooled one (query order-insensitive). */
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
