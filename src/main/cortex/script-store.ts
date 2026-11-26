/**
 * The script vault's Cortex index: save, recall, look up, delete.
 *
 * Why a module: scripts are their own table and their own ranking rules (domain
 * and tag filters). Keeping them beside history gave the class one more reason
 * to change; the vault now talks to `cortex.scripts`.
 */
import { embedText } from './embedder.js';
import { scriptId } from './script-identity.js';
import type { CortexConnection } from './connection.js';
import { toStringArray, type ScriptItem, type ScriptRow } from './types.js';

/** When to use: constructing `CortexDB` — the store shares the connection. */
export class ScriptStore {
  constructor(private readonly connection: CortexConnection) {}

  /** Saves or updates a script in LanceDB with vector embeddings. */
  async save(script: {
    name: string;
    code: string;
    description?: string;
    domain?: string;
    tags?: string[];
  }): Promise<ScriptItem> {
    await this.connection.initialize();
    const table = this.connection.scriptsTable;
    if (!table) throw new Error('Scripts table uninitialized');

    const cleanName = script.name.trim();
    const description = script.description?.trim() || '';
    const domain = script.domain?.trim() || '*';
    const tags = script.tags || [];
    const now = new Date().toISOString();
    const id = scriptId(cleanName);

    // Remove existing script with same name if present
    try {
      await table.delete(`name = '${cleanName.replace(/'/g, "''")}'`);
    } catch {
      // A missing row is the normal first save.
    }

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

  /** Semantically recalls or lists scripts from LanceDB. */
  async recall(
    query?: string,
    options: { domain?: string; tag?: string; limit?: number } = {},
  ): Promise<ScriptItem[]> {
    await this.connection.initialize();
    const table = this.connection.scriptsTable;
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
      id: r.id,
      name: r.name,
      description: r.description,
      code: r.code,
      domain: r.domain,
      tags: toStringArray(r.tags),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      score: r._distance !== undefined ? 1 - r._distance : undefined,
    }));

    if (options.domain && options.domain !== '*') {
      const targetDomain = options.domain.toLowerCase();
      items = items.filter(
        (s) =>
          !s.domain ||
          s.domain === '*' ||
          s.domain.toLowerCase().includes(targetDomain) ||
          targetDomain.includes(s.domain.toLowerCase()),
      );
    }

    if (options.tag) {
      const targetTag = options.tag.toLowerCase();
      items = items.filter((s) => s.tags.some((t) => t.toLowerCase() === targetTag));
    }

    return items;
  }

  /** Retrieves a script by name. */
  async getByName(name: string): Promise<ScriptItem | null> {
    await this.connection.initialize();
    const table = this.connection.scriptsTable;
    if (!table) return null;

    try {
      const cleanName = name.replace(/'/g, "''");
      const rows = await table.query().where(`name = '${cleanName}'`).limit(1).toArray();
      if (rows.length === 0) return null;
      const r = rows[0];
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
    } catch {
      return null;
    }
  }

  /** Deletes a script by name or ID; false when nothing matched. */
  async remove(nameOrId: string): Promise<boolean> {
    await this.connection.initialize();
    const table = this.connection.scriptsTable;
    if (!table) return false;

    const escaped = nameOrId.replace(/'/g, "''");
    const predicate = `id = '${escaped}' OR name = '${escaped}'`;
    try {
      const matches = await table.query().where(predicate).limit(1).toArray();
      if (matches.length === 0) return false;
      await table.delete(predicate);
      return true;
    } catch {
      return false;
    }
  }
}
