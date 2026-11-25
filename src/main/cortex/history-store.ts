/**
 * Page history in Cortex: index a visit, hybrid recall, chronological list,
 * URL-bar suggestions and clearing.
 *
 * Why a module: history is the largest Cortex surface and the only one that
 * ranks (vector + BM25 + lexical). The suggestion merge, recency and lexical
 * score are pure helpers, so the methods stay readable.
 */
import { embedText } from './embedder.js';
import { chunkMarkdown, extractDomain } from './chunker.js';
import type { CortexConnection } from './connection.js';
import { seedHistoryRow } from './connection.js';
import type { BookmarkStore } from './bookmark-store.js';
import type {
  HistoryItem,
  PageHistoryRow,
  RecallResult,
  UrlSuggestion,
} from './types.js';

/** When to use: constructing `CortexDB` — history reads bookmarks for suggestions. */
export class HistoryStore {
  constructor(
    private readonly connection: CortexConnection,
    private readonly bookmarks: BookmarkStore,
  ) {}

  /** Index a visited page's markdown content into LanceDB. */
  async indexPage(url: string, title: string, markdown: string): Promise<number> {
    await this.connection.initialize();
    const table = this.connection.historyTable;
    if (!table) return 0;
    if (!url || url === 'about:blank') return 0;

    const domain = extractDomain(url);
    const cleanTitle = title || domain || url;
    const chunks = chunkMarkdown(markdown);
    if (chunks.length === 0) return 0;

    const visitedAt = new Date().toISOString();
    const rows: PageHistoryRow[] = await Promise.all(
      chunks.map(async (chunk) => {
        const textToEmbed = `${cleanTitle} - ${chunk.content}`;
        return {
          id: `chunk_${Buffer.from(url).toString('base64').slice(0, 32)}_${chunk.chunkIndex}_${Date.now()}`,
          url,
          domain,
          title: cleanTitle,
          chunk_index: chunk.chunkIndex,
          content: chunk.content,
          visited_at: visitedAt,
          vector: await embedText(textToEmbed),
        };
      }),
    );

    await table.add(rows);
    return rows.length;
  }

  /** Perform hybrid/semantic recall across past page history. */
  async recall(query: string, options: { limit?: number; domain?: string } = {}): Promise<RecallResult[]> {
    await this.connection.initialize();
    const table = this.connection.historyTable;
    if (!table || !query || query.trim().length === 0) return [];

    const limit = options.limit || 5;
    const queryVector = await embedText(query);
    const results: Map<string, RecallResult> = new Map();

    // 1. Vector Search
    try {
      let vectorQuery = table.search(queryVector).limit(limit * 2);
      if (options.domain) {
        vectorQuery = vectorQuery.where(`domain = '${options.domain}'`);
      }
      const vecRows = await vectorQuery.toArray();
      for (const row of vecRows) {
        const key = `${row.url}#${row.chunk_index}`;
        results.set(key, {
          url: row.url,
          title: row.title,
          domain: row.domain,
          snippet: row.content,
          chunkIndex: row.chunk_index,
          visitedAt: row.visited_at,
          score: (row as any)._distance !== undefined ? 1 - (row as any)._distance : 0.8,
        });
      }
    } catch (err) {
      console.warn('[CortexDB] Vector search warning:', err);
    }

    // 2. Full-Text Search (BM25)
    try {
      let ftsQuery = table.search(query, 'fts').limit(limit * 2);
      if (options.domain) {
        ftsQuery = ftsQuery.where(`domain = '${options.domain}'`);
      }
      const ftsRows = await ftsQuery.toArray();
      for (const row of ftsRows) {
        const key = `${row.url}#${row.chunk_index}`;
        const existing = results.get(key);
        if (existing) {
          existing.score = (existing.score || 0.5) + 0.5; // Boost score for hybrid match
        } else {
          results.set(key, {
            url: row.url,
            title: row.title,
            domain: row.domain,
            snippet: row.content,
            chunkIndex: row.chunk_index,
            visitedAt: row.visited_at,
            score: 0.75,
          });
        }
      }
    } catch {
      // FTS fallback or index not yet ready
    }

    // Sort by score descending and return top matches
    return Array.from(results.values())
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  }

  /** Retrieve chronological browsing history. */
  async getHistory(options: { limit?: number; domain?: string } = {}): Promise<HistoryItem[]> {
    await this.connection.initialize();
    const table = this.connection.historyTable;
    if (!table) return [];

    const limit = options.limit || 20;
    let q = table.query().where('chunk_index = 0');
    if (options.domain) {
      q = q.where(`domain = '${options.domain}'`);
    }
    const rows = await q.toArray();

    // Deduplicate by URL taking most recent visit
    const urlMap = new Map<string, HistoryItem>();
    for (const row of rows) {
      const existing = urlMap.get(row.url);
      if (!existing || new Date(row.visited_at) > new Date(existing.visitedAt)) {
        urlMap.set(row.url, {
          url: row.url,
          title: row.title,
          domain: row.domain,
          visitedAt: row.visited_at,
        });
      }
    }

    return Array.from(urlMap.values())
      .sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime())
      .slice(0, limit);
  }

  /**
   * URL-bar suggestions: lexical history/bookmarks plus optional semantic recall.
   *
   * The renderer asks for lexical results immediately and a semantic pass after a short debounce,
   * so typing does not pay the embedding cost on every keystroke.
   */
  async suggestUrls(query: string, options: { limit?: number; semantic?: boolean } = {}): Promise<UrlSuggestion[]> {
    await this.connection.initialize();
    const limit = Math.max(1, Math.min(options.limit ?? 8, 12));
    const q = String(query || '').trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);

    const history = await this.getHistory({ limit: 500 }).catch(() => []);
    const bookmarks = await this.bookmarks.list({ limit: 500 }).catch(() => []);
    const byUrl = new Map<string, UrlSuggestion>();

    for (const item of history) {
      const score = q ? lexicalScore(q, tokens, item.url, item.title, item.domain) : 10;
      if (score) mergeSuggestion(byUrl, item, 'history', score + Math.min(5, recencyOf(item.visitedAt) / 1e15));
    }

    for (const item of bookmarks) {
      const domain = extractDomain(item.url) || '';
      const score = q ? lexicalScore(q, tokens, item.url, item.title, domain) : 20;
      if (score) {
        mergeSuggestion(
          byUrl,
          { url: item.url, title: item.title, domain, visitedAt: item.createdAt },
          'bookmark',
          score + 15,
        );
      }
    }

    if (q && options.semantic === true) {
      const recalled = await this.recall(q, { limit: 8 }).catch(() => []);
      for (const item of recalled) {
        mergeSuggestion(
          byUrl,
          { url: item.url, title: item.title, domain: item.domain, visitedAt: item.visitedAt },
          'semantic',
          25 + Math.round((item.score || 0) * 20),
          item.snippet,
        );
      }
    }

    return [...byUrl.values()]
      .sort((a, b) => b.score - a.score || recencyOf(b.visitedAt) - recencyOf(a.visitedAt))
      .slice(0, limit);
  }

  /** Clear browsing history. */
  async clearHistory(olderThan?: string): Promise<void> {
    await this.connection.initialize();
    const db = this.connection.db;
    if (!this.connection.historyTable || !db) return;

    if (!olderThan || olderThan === 'all') {
      await db.dropTable('page_history');
      const seedHistory: PageHistoryRow[] = [
        await seedHistoryRow('Kuang Grade Mark Eleven Cyberdeck Manual', 'Kuang Grade Mark Eleven Cyberdeck Manual'),
      ];
      this.connection.historyTable = await db.createTable('page_history', seedHistory);
    } else {
      await this.connection.historyTable.delete(`visited_at < '${olderThan}'`);
    }
  }
}

/** Fold one candidate into the suggestion map, keeping the best score and every source. */
function mergeSuggestion(
  byUrl: Map<string, UrlSuggestion>,
  item: { url: string; title?: string; domain?: string; visitedAt?: string },
  source: 'history' | 'bookmark' | 'semantic',
  score: number,
  snippet?: string,
): void {
  if (!item.url) return;
  const existing = byUrl.get(item.url);
  if (existing) {
    if (!existing.sources.includes(source)) existing.sources.push(source);
    existing.score = Math.max(existing.score, score);
    if (!existing.snippet && snippet) existing.snippet = snippet;
    if (!existing.visitedAt && item.visitedAt) existing.visitedAt = item.visitedAt;
    return;
  }
  byUrl.set(item.url, {
    url: item.url,
    title: item.title || extractDomain(item.url) || item.url,
    domain: item.domain || extractDomain(item.url) || '',
    visitedAt: item.visitedAt,
    sources: [source],
    score,
    snippet,
  });
}

/** A timestamp in ms, or 0 when absent/unparseable. */
function recencyOf(value?: string): number {
  const t = value ? Date.parse(value) : 0;
  return Number.isFinite(t) ? t : 0;
}

/** Lexical score: exact/prefix matches in URL, domain and title, plus per-token hits. */
function lexicalScore(q: string, tokens: string[], url: string, title: string, domain: string): number {
  if (!q) return 0;
  const u = url.toLowerCase();
  const t = title.toLowerCase();
  const d = domain.toLowerCase();
  const hay = `${u} ${t} ${d}`;
  if (!hay.includes(q) && !tokens.every((token) => hay.includes(token))) return 0;
  let score = 10;
  if (u.startsWith(q)) score += 100;
  else if (u.includes(q)) score += 50;
  if (d.startsWith(q)) score += 60;
  if (t.startsWith(q)) score += 70;
  else if (t.includes(q)) score += 35;
  for (const token of tokens) if (hay.includes(token)) score += 8;
  return score;
}
