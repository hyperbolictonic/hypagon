/**
 * Text helpers shared by the Cortex stores: query tokens, Arrow-list coercion, bookmark
 * matching text, cosine similarity, and SQL literal escaping.
 *
 * When to use: history, bookmarks and scripts stores — so all three filter and rank the same way.
 */

/** When to use: splitting a search query into lowercase, punctuation-stripped terms. */
export function tokenizeQuery(query?: string): string[] {
  if (!query) return [];
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * LanceDB returns list columns as Apache Arrow `Vector`s, not JS arrays, so `Array.isArray` is
 * false and using the value directly silently yields `[]`. Coerce an array, an array-like
 * (Arrow Vector), or a scalar to string[].
 */
export function toStringArray(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map(String);
  if (typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function') {
    return Array.from(value as Iterable<unknown>).map(String);
  }
  return [];
}

/** When to use: the text a bookmark query is matched against (title, notes, URL, tags). */
export function bookmarkSearchText(row: any): string {
  const tags = toStringArray(row.tags).join(' ');
  return `${row.title || ''} ${row.notes || ''} ${row.url || ''} ${tags}`.toLowerCase();
}

/** When to use: ranking bookmark matches by embedding similarity. */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

/** When to use: embedding a value in a LanceDB `where`/`delete` literal. */
export function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}
