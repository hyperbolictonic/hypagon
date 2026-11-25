/**
 * Cortex row shapes, query results and the small pure helpers they need.
 *
 * Why a module: the three stores (history, bookmarks, scripts) share these
 * types, and keeping them in `cortex-db.ts` would make every store import the
 * facade that composes it.
 */

/** When to use: a chunk of a visited page as stored in `page_history`. */
export interface PageHistoryRow {
  id: string;
  url: string;
  domain: string;
  title: string;
  chunk_index: number;
  content: string;
  visited_at: string;
  vector: number[];
  [key: string]: unknown;
}

/** When to use: a saved bookmark as stored in `bookmarks`. */
export interface BookmarkRow {
  id: string;
  url: string;
  title: string;
  notes: string;
  tags: string[];
  created_at: string;
  vector: number[];
  [key: string]: unknown;
}

/** When to use: one memory hit from `history.recall`. */
export interface RecallResult {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  chunkIndex: number;
  visitedAt: string;
  score?: number;
}

/** When to use: one row of the chronological history list. */
export interface HistoryItem {
  url: string;
  title: string;
  domain: string;
  visitedAt: string;
}

/** When to use: one URL-bar suggestion, merged from history, bookmarks and recall. */
export interface UrlSuggestion {
  url: string;
  title: string;
  domain: string;
  visitedAt?: string;
  sources: Array<'history' | 'bookmark' | 'semantic'>;
  score: number;
  snippet?: string;
}

/** When to use: a bookmark as the HUD reads it. */
export interface BookmarkItem {
  id: string;
  url: string;
  title: string;
  notes: string;
  tags: string[];
  createdAt: string;
}

/** When to use: a saved script as stored in `scripts`. */
export interface ScriptRow {
  id: string;
  name: string;
  description: string;
  code: string;
  domain?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  vector: number[];
  [key: string]: unknown;
}

/** When to use: a saved script as the HUD and the tool surface read it. */
export interface ScriptItem {
  id: string;
  name: string;
  description: string;
  code: string;
  domain?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  score?: number;
}

/** Split a search query into lowercase, punctuation-stripped terms. */
export function tokenizeQuery(query?: string): string[] {
  if (!query) return [];
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * LanceDB returns list columns as Apache Arrow `Vector`s, not JS arrays, so
 * `Array.isArray` is false and using the value directly silently yields `[]`.
 * Coerce an array, an array-like/iterable (Arrow Vector), or a scalar to string[].
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

/** The text a bookmark query is matched against (title, notes, URL, tags). */
export function bookmarkSearchText(row: any): string {
  const tags = toStringArray(row.tags).join(' ');
  return `${row.title || ''} ${row.notes || ''} ${row.url || ''} ${tags}`.toLowerCase();
}

/** Cosine similarity of two L2-normalized vectors (equal-length dot product). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
