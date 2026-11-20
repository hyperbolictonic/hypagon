/**
 * The Cortex row and result shapes.
 *
 * Kept apart from the stores so a route (or the deck) can type a result without importing
 * LanceDB, and so every store agrees on one shape.
 */

/** When to use: reading a raw history row from the store (visit time, title, domain). */
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

/** When to use: reading a raw bookmark row from the store. */
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

/** When to use: returning a ranked semantic recall hit (page chunk, score, source). */
export interface RecallResult {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  chunkIndex: number;
  visitedAt: string;
  score?: number;
}

/** When to use: shaping a history entry for `GET /cortex/history` and the deck. */
export interface HistoryItem {
  url: string;
  title: string;
  domain: string;
  visitedAt: string;
}

/** When to use: shaping an address-bar suggestion for `GET /cortex/suggest`. */
export interface UrlSuggestion {
  url: string;
  title: string;
  domain: string;
  visitedAt?: string;
  sources: Array<'history' | 'bookmark' | 'semantic'>;
  score: number;
  snippet?: string;
}

/** When to use: shaping a bookmark for `GET /bookmarks` and the deck. */
export interface BookmarkItem {
  id: string;
  url: string;
  title: string;
  notes: string;
  tags: string[];
  createdAt: string;
}

/** When to use: reading a stored script row from the vault table. */
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

/** When to use: shaping a script for `GET /scripts/list` and recall results. */
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
