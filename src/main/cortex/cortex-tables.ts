/**
 * The LanceDB tables Cortex needs, and the embedding-provider bookkeeping around them.
 *
 * The three tables are seeded once so a fresh install can answer recall, history and script
 * lookups immediately. Vectors from different embedding models are not comparable, so the
 * active provider is recorded next to the store and a change is warned about loudly rather
 * than producing silently wrong rankings.
 *
 * When to use: `CortexDB.initialize` and `clearHistory`.
 */
import * as lancedb from '@lancedb/lancedb';
import fs from 'node:fs';
import path from 'node:path';
import { embedText, getEmbeddingProvider, listEmbeddingProviders, setEmbeddingProvider } from './embedder.js';
import type { BookmarkRow, PageHistoryRow, ScriptRow } from './cortex-types.js';

/** When to use: the three tables a Cortex store opens together. */
export interface CortexTables {
  history: lancedb.Table;
  bookmarks: lancedb.Table;
  scripts: lancedb.Table;
}

/**
 * Honor KUANG_EMBEDDING_PROVIDER when it names a registered provider.
 * Unknown ids fall back to the default with a warning (never fatal).
 */
export function selectEmbeddingProvider(): void {
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
 * Record which embedding provider built the stored vectors, and warn when the active provider
 * differs — vectors from different models are not comparable.
 */
export function assertEmbeddingProviderConsistency(storageDir: string): void {
  const active = getEmbeddingProvider();
  const metaPath = path.join(storageDir, 'embedding-provider.json');

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

/** When to use: `initialize` — create or open all three tables, seeding the manual entries. */
export async function openCortexTables(db: lancedb.Connection): Promise<CortexTables> {
  const tables = await db.tableNames();
  return {
    history: await openHistory(db, tables.includes('page_history')),
    bookmarks: await openBookmarks(db, tables.includes('bookmarks')),
    scripts: await openScripts(db, tables.includes('scripts')),
  };
}

/** When to use: the manual's seed row — one shape for the first open and for a history reset. */
async function seedHistoryRow(content: string, embedInput: string): Promise<PageHistoryRow> {
  return {
    id: 'seed_manual_0',
    url: 'mark-eleven://manual',
    domain: 'internal',
    title: 'Cyberdeck Manual',
    chunk_index: 0,
    content,
    visited_at: new Date().toISOString(),
    vector: await embedText(embedInput),
  };
}

/** When to use: `clearHistory('all')` — drop the history table and seed the manual again. */
export async function resetHistoryTable(db: lancedb.Connection): Promise<lancedb.Table> {
  await db.dropTable('page_history');
  return db.createTable('page_history', [
    await seedHistoryRow('Kuang Grade Mark Eleven Cyberdeck Manual', 'Cyberdeck Manual'),
  ]);
}

async function openHistory(db: lancedb.Connection, exists: boolean): Promise<lancedb.Table> {
  if (exists) return db.openTable('page_history');

  const table = await db.createTable('page_history', [
    await seedHistoryRow(
      'Kuang Grade Mark Eleven Cyberdeck Manual - Chromium MCP Navigator with Bézier Kinematics and Multi-Tab support.',
      'Cyberdeck Manual Kuang Grade Mark Eleven Chromium MCP Navigator',
    ),
  ]);
  try {
    await table.createIndex('content', { config: lancedb.Index.fts() });
  } catch {
    // FTS indexing may fail on initial single-row table, will retry on updates
  }
  return table;
}

async function openBookmarks(db: lancedb.Connection, exists: boolean): Promise<lancedb.Table> {
  if (exists) return db.openTable('bookmarks');

  const seedBookmark: BookmarkRow[] = [
    {
      id: 'bkmk_manual',
      url: 'mark-eleven://manual',
      title: 'Cyberdeck Manual',
      notes: 'Built-in quickstart and system guide',
      tags: ['system', 'docs', 'manual'],
      created_at: new Date().toISOString(),
      vector: await embedText('Cyberdeck Manual Built-in quickstart and system guide system docs manual'),
    },
  ];
  return db.createTable('bookmarks', seedBookmark);
}

async function openScripts(db: lancedb.Connection, exists: boolean): Promise<lancedb.Table> {
  if (exists) return db.openTable('scripts');

  const seedScript: ScriptRow = {
    id: 'script_extract_links',
    name: 'extract_all_links',
    description: 'Extracts all anchor links, text, and href URLs currently present on the page into a clean array.',
    code: '(() => Array.from(document.querySelectorAll("a[href]")).map(a => ({ text: a.innerText.trim(), href: a.href })).filter(l => l.text && l.href))()',
    domain: '*',
    tags: ['dom', 'links', 'extraction'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    vector: await embedText('extract_all_links Extracts all anchor links text and href URLs currently present on the page into a clean array dom links extraction'),
  };
  return db.createTable('scripts', [seedScript]);
}
