/**
 * Page history: indexing a visit, hybrid recall, chronological listing, and clearing.
 *
 * Recall runs a vector search and a BM25 full-text search and merges them by URL+chunk, so a
 * keyword hit and a semantic hit reinforce each other instead of competing.
 *
 * When to use: `CortexDB` — this owns the queries; the class owns the connection and tables.
 */
import type * as lancedb from '@lancedb/lancedb';
import { embedText } from './embedder.js';
import { chunkMarkdown, extractDomain } from './chunker.js';
import { escapeSql } from './cortex-search.js';
import type { HistoryItem, PageHistoryRow, RecallResult } from './cortex-types.js';

/** When to use: `indexPage` — chunk the markdown, embed each chunk, append the rows. */
export async function indexPageInto(
  table: lancedb.Table | null,
  url: string,
  title: string,
  markdown: string,
): Promise<number> {
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

/** When to use: `recall` — hybrid vector + BM25 search over page history. */
export async function recallFrom(
  table: lancedb.Table | null,
  query: string,
  options: { limit?: number; domain?: string } = {},
): Promise<RecallResult[]> {
  if (!table || !query || query.trim().length === 0) return [];

  const limit = options.limit || 5;
  const queryVector = await embedText(query);
  const results: Map<string, RecallResult> = new Map();

  // 1. Vector Search
  try {
    let vectorQuery = table.search(queryVector).limit(limit * 2);
    if (options.domain) {
      vectorQuery = vectorQuery.where(`domain = '${escapeSql(options.domain)}'`);
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
      ftsQuery = ftsQuery.where(`domain = '${escapeSql(options.domain)}'`);
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

/** When to use: `getHistory` — chronological, de-duplicated by URL (newest visit wins). */
export async function historyFrom(
  table: lancedb.Table | null,
  options: { limit?: number; domain?: string } = {},
): Promise<HistoryItem[]> {
  if (!table) return [];

  const limit = options.limit || 20;
  let q = table.query().where('chunk_index = 0');
  if (options.domain) {
    q = q.where(`domain = '${escapeSql(options.domain)}'`);
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

/** When to use: `clearHistory` — delete everything older than a timestamp (not `all`). */
export async function clearHistoryBefore(table: lancedb.Table | null, olderThan: string): Promise<void> {
  if (!table) return;
  await table.delete(`visited_at < '${escapeSql(olderThan)}'`);
}
