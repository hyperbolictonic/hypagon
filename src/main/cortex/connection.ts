/**
 * The LanceDB connection and its three tables.
 *
 * Why a module: opening the database, creating the seed rows and recording the
 * embedding provider is one job. The history, bookmark and script stores all
 * read the same tables, so they take this connection instead of each opening
 * their own.
 */
import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs';
import {
  embedText,
  getEmbeddingProvider,
  listEmbeddingProviders,
  setEmbeddingProvider,
} from './embedder.js';
import type { BookmarkRow, PageHistoryRow, ScriptRow } from './types.js';

/**
 * The history table's seed row: the manual page an agent can always recall.
 * `content` is what agents read; `embedding` is what the vector matches on
 * (the two intentionally differ for the full manual copy).
 */
export async function seedHistoryRow(content: string, embedding: string): Promise<PageHistoryRow> {
  return {
    id: 'seed_manual_0',
    url: 'mark-eleven://manual',
    domain: 'internal',
    title: 'Cyberdeck Manual',
    chunk_index: 0,
    content,
    visited_at: new Date().toISOString(),
    vector: await embedText(embedding),
  };
}

/** The bookmark table's seed: the same manual page, tagged for discovery. */
async function seedBookmarkRow(): Promise<BookmarkRow> {
  return {
    id: 'bkmk_manual',
    url: 'mark-eleven://manual',
    title: 'Cyberdeck Manual',
    notes: 'Built-in quickstart and system guide',
    tags: ['system', 'docs', 'manual'],
    created_at: new Date().toISOString(),
    vector: await embedText('Cyberdeck Manual Built-in quickstart and system guide system docs manual'),
  };
}

/** The script table's seed: one DOM extraction script so the vault is never empty. */
async function seedScriptRow(): Promise<ScriptRow> {
  return {
    id: 'script_extract_links',
    name: 'extract_all_links',
    description: 'Extracts all anchor links, text, and href URLs currently present on the page into a clean array.',
    code: '(() => Array.from(document.querySelectorAll("a[href]")).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(l => l.text && l.href))()',
    domain: '*',
    tags: ['dom', 'links', 'extraction'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    vector: await embedText(
      'extract_all_links Extracts all anchor links text and href URLs currently present on the page into a clean array dom links extraction',
    ),
  };
}

/** When to use: constructing `CortexDB` — one connection per storage directory. */
export class CortexConnection {
  db: lancedb.Connection | null = null;
  historyTable: lancedb.Table | null = null;
  bookmarksTable: lancedb.Table | null = null;
  scriptsTable: lancedb.Table | null = null;

  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly storageDir: string) {}

  /** When to use: every store call — opens the database and tables once. */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }

      this.db = await lancedb.connect(this.storageDir);
      this.selectEmbeddingProvider();
      const tables = await this.db.tableNames();

      // Initialize page_history table
      if (!tables.includes('page_history')) {
        const seedHistory: PageHistoryRow[] = [
          await seedHistoryRow(
            'Kuang Grade Mark Eleven Cyberdeck Manual - Chromium MCP Navigator with Bézier Kinematics and Multi-Tab support.',
            'Cyberdeck Manual Kuang Grade Mark Eleven Chromium MCP Navigator',
          ),
        ];
        this.historyTable = await this.db.createTable('page_history', seedHistory);
        try {
          await this.historyTable.createIndex('content', { config: lancedb.Index.fts() });
        } catch {
          // FTS indexing may fail on initial single-row table, will retry on updates
        }
      } else {
        this.historyTable = await this.db.openTable('page_history');
      }

      // Initialize bookmarks table
      if (!tables.includes('bookmarks')) {
        this.bookmarksTable = await this.db.createTable('bookmarks', [await seedBookmarkRow()]);
      } else {
        this.bookmarksTable = await this.db.openTable('bookmarks');
      }

      // Initialize scripts table
      if (!tables.includes('scripts')) {
        this.scriptsTable = await this.db.createTable('scripts', [await seedScriptRow()]);
      } else {
        this.scriptsTable = await this.db.openTable('scripts');
      }

      this.assertEmbeddingProviderConsistency();
      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  /**
   * Honor KUANG_EMBEDDING_PROVIDER when it names a registered provider.
   * Unknown ids fall back to the default with a warning (never fatal).
   */
  private selectEmbeddingProvider(): void {
    const requested = process.env.KUANG_EMBEDDING_PROVIDER?.trim();
    if (!requested) return;
    try {
      setEmbeddingProvider(requested);
    } catch {
      console.warn(
        `[CortexDB] Unknown KUANG_EMBEDDING_PROVIDER "${requested}"; ` +
          `using "${getEmbeddingProvider().id}". Available: ${listEmbeddingProviders().join(', ')}`,
      );
    }
  }

  /**
   * Record which embedding provider built the stored vectors, and warn when the
   * active provider differs — vectors from different models are not comparable,
   * so recall/ranking would be silently wrong until Cortex is re-embedded.
   */
  private assertEmbeddingProviderConsistency(): void {
    const active = getEmbeddingProvider();
    const metaPath = path.join(this.storageDir, 'embedding-provider.json');

    let stored: { id?: string; dim?: number } | null = null;
    try {
      if (fs.existsSync(metaPath)) {
        stored = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      }
    } catch {
      stored = null;
    }

    if (stored && (stored.id !== active.id || stored.dim !== active.dim)) {
      console.warn(
        `[CortexDB] Embedding provider changed: stored vectors were built with "${stored.id}" ` +
          `(dim ${stored.dim}), but the active provider is "${active.id}" (dim ${active.dim}). ` +
          `Existing Cortex vectors are not comparable until re-embedded.`,
      );
    }

    try {
      fs.writeFileSync(
        metaPath,
        JSON.stringify({ id: active.id, dim: active.dim, updatedAt: new Date().toISOString() }, null, 2),
      );
    } catch {
      // Non-fatal: the guard is best-effort bookkeeping.
    }
  }
}
