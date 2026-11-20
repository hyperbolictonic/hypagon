/**
 * Kuang Grade Mark Eleven - Cortex LanceDB Memory Subsystem
 *
 * Implements persistent vector & full-text search across page visits,
 * extracted readability markdown, and research bookmarks.
 *
 * This class owns the connection, the three tables and the public API; the queries live in
 * `history-store.ts`, `bookmarks-store.ts` and `scripts-store.ts`, table creation and the
 * embedding-provider guard in `cortex-tables.ts`, and the shared text helpers in
 * `cortex-search.ts`.
 */

import * as lancedb from '@lancedb/lancedb';
import fs from 'fs';
import { dataPath } from '../data-paths.js';
import { extractDomain } from './chunker.js';
import {
  assertEmbeddingProviderConsistency,
  openCortexTables,
  resetHistoryTable,
  selectEmbeddingProvider,
} from './cortex-tables.js';
import { clearHistoryBefore, historyFrom, indexPageInto, recallFrom } from './history-store.js';
import { addBookmarkTo, deleteBookmarkFrom, isBookmarkedIn, listBookmarksFrom } from './bookmarks-store.js';
import { deleteScriptFrom, getScriptFrom, recallScriptsFrom, saveScriptTo } from './scripts-store.js';
import type { BookmarkItem, HistoryItem, RecallResult, ScriptItem, UrlSuggestion } from './cortex-types.js';

export type {
  BookmarkItem,
  BookmarkRow,
  HistoryItem,
  PageHistoryRow,
  RecallResult,
  ScriptItem,
  ScriptRow,
  UrlSuggestion,
} from './cortex-types.js';

/** When to use: opening the local LanceDB memory store, or building an isolated instance in tests. */
export class CortexDB {
  private db: lancedb.Connection | null = null;
  private historyTable: lancedb.Table | null = null;
  private bookmarksTable: lancedb.Table | null = null;
  private scriptsTable: lancedb.Table | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private storageDir: string;

  constructor(customStorageDir?: string) {
    this.storageDir = customStorageDir || dataPath('cortex');
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      this.db = await lancedb.connect(this.storageDir);
      selectEmbeddingProvider();
      const tables = await openCortexTables(this.db);
      this.historyTable = tables.history;
      this.bookmarksTable = tables.bookmarks;
      this.scriptsTable = tables.scripts;

      assertEmbeddingProviderConsistency(this.storageDir);
      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  /** When to use: indexing a visited page's markdown; returns the chunk count. */
  public async indexPage(url: string, title: string, markdown: string): Promise<number> {
    await this.initialize();
    return indexPageInto(this.historyTable, url, title, markdown);
  }

  /** When to use: hybrid semantic + keyword recall across past page history. */
  public async recall(query: string, options: { limit?: number; domain?: string } = {}): Promise<RecallResult[]> {
    await this.initialize();
    return recallFrom(this.historyTable, query, options);
  }

  /** When to use: chronological browsing history for `GET /cortex/history`. */
  public async getHistory(options: { limit?: number; domain?: string } = {}): Promise<HistoryItem[]> {
    await this.initialize();
    return historyFrom(this.historyTable, options);
  }

  /**
   * URL-bar suggestions: lexical history/bookmarks plus optional semantic recall.
   *
   * The renderer asks for lexical results immediately and a semantic pass after a short debounce,
   * so typing does not pay the embedding cost on every keystroke.
   */
  public async suggestUrls(query: string, options: { limit?: number; semantic?: boolean } = {}): Promise<UrlSuggestion[]> {
    await this.initialize();
    const limit = Math.max(1, Math.min(options.limit ?? 8, 12));
    const q = String(query || '').trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);

    const history = await this.getHistory({ limit: 500 }).catch(() => []);
    const bookmarks = await this.listBookmarks({ limit: 500 }).catch(() => []);
    const byUrl = new Map<string, UrlSuggestion>();

    const add = (
      item: { url: string; title?: string; domain?: string; visitedAt?: string },
      source: 'history' | 'bookmark' | 'semantic',
      score: number,
      snippet?: string,
    ) => {
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
    };

    const recency = (value?: string) => {
      const t = value ? Date.parse(value) : 0;
      return Number.isFinite(t) ? t : 0;
    };

    const lexicalScore = (url: string, title: string, domain: string): number => {
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
    };

    for (const item of history) {
      const score = q ? lexicalScore(item.url, item.title, item.domain) : 10;
      if (score) add(item, 'history', score + Math.min(5, recency(item.visitedAt) / 1e15));
    }

    for (const item of bookmarks) {
      const domain = extractDomain(item.url) || '';
      const score = q ? lexicalScore(item.url, item.title, domain) : 20;
      if (score) {
        add({ url: item.url, title: item.title, domain, visitedAt: item.createdAt }, 'bookmark', score + 15);
      }
    }

    if (q && options.semantic === true) {
      const recalled = await this.recall(q, { limit: 8 }).catch(() => []);
      for (const item of recalled) {
        add(
          { url: item.url, title: item.title, domain: item.domain, visitedAt: item.visitedAt },
          'semantic',
          25 + Math.round((item.score || 0) * 20),
          item.snippet,
        );
      }
    }

    return [...byUrl.values()]
      .sort((a, b) => b.score - a.score || recency(b.visitedAt) - recency(a.visitedAt))
      .slice(0, limit);
  }

  /** When to use: clearing browsing history (`'all'` reseeds the manual). */
  public async clearHistory(olderThan?: string): Promise<void> {
    await this.initialize();
    if (!this.historyTable || !this.db) return;

    if (!olderThan || olderThan === 'all') {
      this.historyTable = await resetHistoryTable(this.db);
    } else {
      await clearHistoryBefore(this.historyTable, olderThan);
    }
  }

  /** When to use: adding or updating a bookmark. */
  public async addBookmark(bookmark: { url: string; title?: string; notes?: string; tags?: string[] }): Promise<BookmarkItem> {
    await this.initialize();
    return addBookmarkTo(this.bookmarksTable, bookmark);
  }

  /** When to use: listing or searching bookmarks. */
  public async listBookmarks(options: { query?: string; tag?: string; limit?: number } = {}): Promise<BookmarkItem[]> {
    await this.initialize();
    return listBookmarksFrom(this.bookmarksTable, options);
  }

  /** When to use: deleting a bookmark by id or URL. */
  public async deleteBookmark(urlOrId: string): Promise<boolean> {
    await this.initialize();
    return deleteBookmarkFrom(this.bookmarksTable, urlOrId);
  }

  /** When to use: the tab bar's bookmark state. */
  public async isBookmarked(url: string): Promise<boolean> {
    await this.initialize();
    return isBookmarkedIn(this.bookmarksTable, url);
  }

  /** When to use: saving or updating a script in the vault. */
  public async saveScript(script: {
    name: string;
    code: string;
    description?: string;
    domain?: string;
    tags?: string[];
  }): Promise<ScriptItem> {
    await this.initialize();
    return saveScriptTo(this.scriptsTable, script);
  }

  /** When to use: semantically recalling or listing scripts. */
  public async recallScripts(
    query?: string,
    options: { domain?: string; tag?: string; limit?: number } = {},
  ): Promise<ScriptItem[]> {
    await this.initialize();
    return recallScriptsFrom(this.scriptsTable, query, options);
  }

  /** When to use: retrieving a script by name. */
  public async getScriptByName(name: string): Promise<ScriptItem | null> {
    await this.initialize();
    return getScriptFrom(this.scriptsTable, name);
  }

  /** When to use: deleting a script by name or id. */
  public async deleteScript(nameOrId: string): Promise<boolean> {
    await this.initialize();
    return deleteScriptFrom(this.scriptsTable, nameOrId);
  }
}

// Global singleton instance for the main chassis process
/** When to use: the process-wide Cortex store (history, bookmarks, semantic recall). */
export const cortex = new CortexDB();
