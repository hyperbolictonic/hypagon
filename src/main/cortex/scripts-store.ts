/**
 * The script vault: save/update, semantic recall or list, lookup by name, delete.
 *
 * Scripts are embedded from name, description, domain, tags and the first 300 characters of
 * code, so recall matches intent rather than an exact title. Domain and tag filters apply after
 * recall, because a script's `*` domain means "any page".
 *
 * When to use: `CortexDB` — this owns the queries; the class owns the table.
 */
import type * as lancedb from '@lancedb/lancedb';
import { embedText } from './embedder.js';
import { escapeSql, toStringArray } from './cortex-search.js';
import type { ScriptItem, ScriptRow } from './cortex-types.js';

/** When to use: mapping one stored row to the published item (score added by recall). */
function scriptItem(r: any): ScriptItem {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    code: r.code,
    domain: r.domain,
    tags: toStringArray(r.tags),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** When to use: `saveScript` — replace any script with the same name. */
export async function saveScriptTo(
  table: lancedb.Table | null,
  script: { name: string; code: string; description?: string; domain?: string; tags?: string[] },
): Promise<ScriptItem> {
  if (!table) throw new Error('Scripts table uninitialized');

  const cleanName = script.name.trim();
  const description = script.description?.trim() || '';
  const domain = script.domain?.trim() || '*';
  const tags = script.tags || [];
  const now = new Date().toISOString();
  const id = `script_${cleanName.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()}`;

  // Remove existing script with same name if present
  try {
    await table.delete(`name = '${escapeSql(cleanName)}'`);
  } catch {}

  const textToEmbed = `${cleanName} ${description} ${domain} ${tags.join(' ')} ${script.code.slice(0, 300)}`;
  const row: ScriptRow = {
    id,
    name: cleanName,
    description,
    code: script.code,
    domain,
    tags,
    created_at: now,
    updated_at: now,
    vector: await embedText(textToEmbed),
  };

  await table.add([row]);

  return {
    id,
    name: cleanName,
    description,
    code: script.code,
    domain,
    tags,
    createdAt: now,
    updatedAt: now,
  };
}

/** When to use: `recallScripts` — semantic search (or a plain list) with domain/tag filters. */
export async function recallScriptsFrom(
  table: lancedb.Table | null,
  query?: string,
  options: { domain?: string; tag?: string; limit?: number } = {},
): Promise<ScriptItem[]> {
  if (!table) return [];

  const limit = options.limit || 20;
  let rows: any[] = [];

  if (query && query.trim().length > 0) {
    const qVec = await embedText(query);
    rows = await table.search(qVec).limit(limit).toArray();
  } else {
    rows = await table.query().limit(limit).toArray();
  }

  let items: ScriptItem[] = rows.map((r) => ({
    ...scriptItem(r),
    score: r._distance !== undefined ? 1 - r._distance : undefined,
  }));

  if (options.domain && options.domain !== '*') {
    const targetDomain = options.domain.toLowerCase();
    items = items.filter(
      (s) => !s.domain || s.domain === '*' || s.domain.toLowerCase().includes(targetDomain) || targetDomain.includes(s.domain.toLowerCase()),
    );
  }

  if (options.tag) {
    const targetTag = options.tag.toLowerCase();
    items = items.filter((s) => s.tags.some((t) => t.toLowerCase() === targetTag));
  }

  return items;
}

/** When to use: `getScriptByName`. */
export async function getScriptFrom(table: lancedb.Table | null, name: string): Promise<ScriptItem | null> {
  if (!table) return null;
  try {
    const rows = await table.query().where(`name = '${escapeSql(name)}'`).limit(1).toArray();
    if (rows.length === 0) return null;
    return scriptItem(rows[0]);
  } catch {
    return null;
  }
}

/** When to use: `deleteScript` — by name or id. */
export async function deleteScriptFrom(table: lancedb.Table | null, nameOrId: string): Promise<boolean> {
  if (!table) return false;
  try {
    const escaped = escapeSql(nameOrId);
    await table.delete(`id = '${escaped}' OR name = '${escaped}'`);
    return true;
  } catch {
    return false;
  }
}
