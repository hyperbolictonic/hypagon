/**
 * Kuang Grade Mark Eleven - Cortex LanceDB Memory Subsystem
 *
 * Implements persistent vector & full-text search across page visits,
 * extracted readability markdown, and research bookmarks.
 *
 * Why this file is small: the connection/tables live in `connection.ts`, and
 * each domain (history, bookmarks, scripts) is its own store with the
 * connection as an explicit dependency. `CortexDB` composes them and keeps the
 * one method callers need at boot (`initialize`).
 */
import { dataPath } from '../data-paths.js';
import { CortexConnection } from './connection.js';
import { BookmarkStore } from './bookmark-store.js';
import { ScriptStore } from './script-store.js';
import { HistoryStore } from './history-store.js';

export type {
  BookmarkItem,
  BookmarkRow,
  HistoryItem,
  PageHistoryRow,
  RecallResult,
  ScriptItem,
  ScriptRow,
  UrlSuggestion,
} from './types.js';

export class CortexDB {
  private readonly connection: CortexConnection;

  /** When to use: recalling or saving bookmarks (`cortex.bookmarks`). */
  readonly bookmarks: BookmarkStore;
  /** When to use: the script vault (`cortex.scripts`). */
  readonly scripts: ScriptStore;
  /** When to use: indexing visits, recall, history and URL suggestions (`cortex.history`). */
  readonly history: HistoryStore;

  constructor(customStorageDir?: string) {
    this.connection = new CortexConnection(customStorageDir || dataPath('cortex'));
    this.bookmarks = new BookmarkStore(this.connection);
    this.scripts = new ScriptStore(this.connection);
    this.history = new HistoryStore(this.connection, this.bookmarks);
  }

  /** When to use: at boot — warm the tables so the first query does not pay initialization. */
  async initialize(): Promise<void> {
    await this.connection.initialize();
  }
}

// Global singleton instance for the main chassis process
export const cortex = new CortexDB();
