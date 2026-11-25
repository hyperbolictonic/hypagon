/**
 * Bookmarks in Cortex: add, list/search, delete, exists.
 *
 * Why a module: the bookmark verbs are the only thing the HUD's bookmark UI and
 * the bridge routes need, and they all read one table. Keeping them apart from
 * history means the query-building for one never grows the other.
 */
import { embedText } from './embedder.js';
import { extractDomain } from './chunker.js';
import type { CortexConnection } from './connection.js';
import {
  bookmarkSearchText,
  cosineSimilarity,
  tokenizeQuery,
  toStringArray,
  type BookmarkItem,
  type BookmarkRow,
} from './types.js';

/** When to use: constructing `CortexDB` — the store shares the connection. */
export class BookmarkStore {
  constructor(private readonly connection: CortexConnection) {}

  /** When to use: the bookmark button, or `POST /bookmarks`. */
  async add(bookmark: {
    url: string;
    title?: string;
    notes?: string;
    tags?: string[];
  }): Promise<BookmarkItem> {
    await this.connection.initialize();
    const table = this.connection.bookmarksTable;
    if (!table) throw new Error('Bookmarks table not initialized');

    const title = bookmark.title || extractDomain(bookmark.url) || bookmark.url;
    const notes = bookmark.notes || '';
    const tags = bookmark.tags || [];
    const createdAt = new Date().toISOString();
    const id = `bkmk_${Buffer.from(bookmark.url).toString('base64').replace(/=/g, '').slice(0, 24)}`;

    // Remove existing bookmark with same URL if present
    try {
      await table.delete(`url = '${bookmark.url.replace(/'/g, "''")}'`);
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

    return {
      id,
      url: bookmark.url,
      title,
      notes,
      tags,
      createdAt,
    };
  }

  /**
   * List or search bookmarks.
   *
   * `query` is a lexical filter, not just a ranking: a bookmark matches when
   * every whitespace-separated query term appears (case-insensitively, as a
   * substring) in its searchable text — title, notes, URL, and tags. Matches are
   * then ordered by embedding similarity (most relevant first). With no `query`,
   * returns the most recent bookmarks.
   */
  async list(options: { query?: string; tag?: string; limit?: number } = {}): Promise<BookmarkItem[]> {
    await this.connection.initialize();
    const table = this.connection.bookmarksTable;
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

  /** When to use: the bookmark's delete control, by id or URL. */
  async remove(urlOrId: string): Promise<boolean> {
    await this.connection.initialize();
    const table = this.connection.bookmarksTable;
    if (!table) return false;

    try {
      const escaped = urlOrId.replace(/'/g, "''");
      await table.delete(`id = '${escaped}' OR url = '${escaped}'`);
      return true;
    } catch {
      return false;
    }
  }

  /** When to use: the URL bar's star and the bookmarks route. */
  async has(url: string): Promise<boolean> {
    await this.connection.initialize();
    const table = this.connection.bookmarksTable;
    if (!table || !url) return false;

    try {
      const escaped = url.replace(/'/g, "''");
      const res = await table.query().where(`url = '${escaped}'`).toArray();
      return res.length > 0;
    } catch {
      return false;
    }
  }
}
