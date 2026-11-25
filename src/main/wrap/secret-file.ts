/**
 * The credential document on disk: `<dir>/secrets.json`, written atomically with
 * owner-only permissions.
 *
 * Why a module: the store, the token cache and the listing all read and write the
 * same file. One small class keeps the read-repair (a malformed record is dropped,
 * not fatal) and the temp-file-then-rename write in a single place.
 */
import fs from 'node:fs';
import path from 'node:path';
import { writePrivateFile } from '../security/private-file.ts';
import { isSecretRecord } from './secret-rules.ts';
import type { SecretFile, SecretRecord } from './secret-types.ts';

/** When to use: `SecretStore` — one document per wrap data directory. */
export class SecretFileStore {
  /** The wrap data directory (the file lives directly inside it). */
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** The stored records, with malformed entries dropped and older records normalised. */
  read(): SecretFile {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath(), 'utf8'));
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.secrets)) {
        return { schemaVersion: 1, secrets: [] };
      }
      return {
        schemaVersion: 1,
        secrets: parsed.secrets
          .filter(isSecretRecord)
          .map((secret: SecretRecord) => ({ ...secret, kind: secret.kind ?? 'static' })),
      };
    } catch {
      return { schemaVersion: 1, secrets: [] };
    }
  }

  /** Replace the document atomically; throws so the caller can report a save failure. */
  write(file: SecretFile): void {
    writePrivateFile(this.filePath(), `${JSON.stringify(file, null, 2)}\n`, { ensureDir: this.dir });
  }

  private filePath(): string {
    return path.join(this.dir, 'secrets.json');
  }
}
