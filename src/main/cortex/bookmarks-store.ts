/**
 * Bookmarks: add/update, list or search, delete, and the URL check the tab bar uses.
 *
 * A bookmark query is a lexical filter (every term must appear in title, notes, URL or tags)
 * and then a semantic ranking, so "rust async" finds the Rust bookmark even when the words
 * appear in different fields.
 *
 * When to use: `CortexDB` — this owns the queries; the class owns the table.
 */
import type * as lancedb from '@lancedb/lancedb';
import { embedText } from './embedder.js';
import { extractDomain } from './chunker.js';
import { bookmarkSearchText, cosineSimilarity, escapeSql, tokenizeQuery, toStringArray } from './cortex-search.js';
import type { BookmarkItem, BookmarkRow } from './cortex-types.js';

/** When to use: `addBookmark` — replace any bookmark with the same URL. */
export async function addBookmarkTo(
  table: lancedb.Table | null,
  bookmark: { url: string; title?: string; notes?: string; tags?: string[] },
): Promise<BookmarkItem> {
  if (!table) throw new Error('Bookmarks table not initialized');

  const title = bookmark.title || extractDomain(bookmark.url) || bookmark.url;
  const notes = bookmark.notes || '';
  const tags = bookmark.tags || [];
  const createdAt = new Date().toISOString();
  const id = `bkmk_${Buffer.from(bookmark.url).toString('base64').replace(/=/g, '').slice(0, 24)}`;

  // Remove existing bookmark with same URL if present
  try {
    await table.delete(`url = '${escapeSql(bookmark.url)}'`);
  } catch {
    // Ignore if not present
  }

  const textToEmbed = `${title} ${notes} ${tags.join(' ')}`;
  const row: BookmarkRow = {
    id,
    url: bookmark.url,
    title,
    notes,
    tags,
    created_at: createdAt,
    vector: await embedText(textToEmbed),
  };

  await table.add([row]);

  return { id, url: bookmark.url, title, notes, tags, createdAt };
}

/**
 * When to use: `listBookmarks` — lexical filter, semantic order, optional tag filter.
 * With no query, returns the most recent bookmarks.
 */
export async function listBookmarksFrom(
  table: lancedb.Table | null,
  options: { query?: string; tag?: string; limit?: number } = {},
): Promise<BookmarkItem[]> {
  if (!table) return [];

  const limit = options.limit || 20;
  const tokens = tokenizeQuery(options.query);

  let rows: any[];
  if (tokens.length > 0) {
    const queryVector = await embedText(options.query!);
    const all = await table.query().toArray();
    const matches = all.filter((row: any) => {
      const text = bookmarkSearchText(row);
      return tokens.every((token) => text.includes(token));
    });
    const scored = await Promise.all(
      matches.map(async (row: any) => ({
        row,
        score: cosineSimilarity(queryVector, await embedText(bookmarkSearchText(row))),
      })),
    );
    scored.sort((a, b) => b.score - a.score);
    rows = scored.map((entry) => entry.row);
  } else if (options.tag) {
    // Filter by tag before applying the limit, so the slice can't hide matches.
    rows = await table.query().toArray();
  } else {
    // Newest first (LanceDB's default row order is insertion order).
    const all = await table.query().toArray();
    all.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    rows = all;
  }

  let items: BookmarkItem[] = rows.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    notes: r.notes,
    tags: toStringArray(r.tags),
    createdAt: r.created_at,
  }));

  if (options.tag) {
    const targetTag = options.tag.trim().toLowerCase();
    items = items.filter((b) => b.tags.some((t) => t.toLowerCase() === targetTag));
  }

  return items.slice(0, limit);
}

/** When to use: `deleteBookmark` — by id or URL. */
export async function deleteBookmarkFrom(table: lancedb.Table | null, urlOrId: string): Promise<boolean> {
  if (!table) return false;
  try {
    const escaped = escapeSql(urlOrId);
    await table.delete(`id = '${escaped}' OR url = '${escaped}'`);
    return true;
  } catch {
    return false;
  }
}

/** When to use: `isBookmarked` — the tab bar's bookmark state. */
export async function isBookmarkedIn(table: lancedb.Table | null, url: string): Promise<boolean> {
  if (!table || !url) return false;
  try {
    const res = await table.query().where(`url = '${escapeSql(url)}'`).toArray();
    return res.length > 0;
  } catch {
    return false;
  }
}
