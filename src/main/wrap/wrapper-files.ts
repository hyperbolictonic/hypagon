/**
 * The wrapper files on disk: one JSON per wrapper under `<dir>/wrappers/`, read and
 * written atomically.
 *
 * Why a module: the store's job is the create/update/delete rules over validated
 * wrappers; where the bytes live, how a malformed file is skipped and how a write is
 * made interrupt-safe is one concern, and it is the only part that touches `fs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { WrapWrapper } from './types.ts';
import { validateWrapper } from './validate-wrapper.ts';

/** When to use: `WrapStore` — one directory per wrap data dir. */
export class WrapperFiles {
  /** The wrap data directory (wrappers live in its `wrappers/` child). */
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** Create the wrappers directory if it does not exist. */
  ensure(): void {
    fs.mkdirSync(this.wrappersDir(), { recursive: true });
  }

  /** Every wrapper file path, or an empty list when the directory is missing. */
  paths(): string[] {
    try {
      return fs
        .readdirSync(this.wrappersDir(), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => path.join(this.wrappersDir(), entry.name));
    } catch {
      return [];
    }
  }

  /** The path for an id, or null when the id could escape the directory. */
  pathFor(id: string): string | null {
    if (typeof id !== 'string' || !id || id.includes('..') || !/^[a-z0-9._-]+$/i.test(id)) return null;
    return path.join(this.wrappersDir(), `${id}.json`);
  }

  /** Read and validate one file; an unreadable or invalid wrapper is skipped. */
  read(file: string): WrapWrapper | undefined {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const validation = validateWrapper(parsed);
      return validation.ok ? validation.wrapper : undefined;
    } catch {
      return undefined;
    }
  }

  /** Write atomically (temp file + rename) so an interrupted save cannot truncate. */
  write(wrapper: WrapWrapper): { ok: true } | { ok: false; error: string } {
    try {
      this.ensure();
      const target = this.pathFor(wrapper.id)!;
      const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(wrapper, null, 2)}\n`, 'utf8');
      fs.renameSync(temp, target);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  /** Remove one wrapper file; false when it is absent or the id is unusable. */
  remove(id: string): boolean {
    const file = this.pathFor(id);
    if (!file) return false;
    try {
      fs.unlinkSync(file);
      return true;
    } catch {
      return false;
    }
  }

  /** How many wrapper files exist. */
  count(): number {
    try {
      return fs.readdirSync(this.wrappersDir()).filter((name) => name.endsWith('.json')).length;
    } catch {
      return 0;
    }
  }

  private wrappersDir(): string {
    return path.join(this.dir, 'wrappers');
  }
}
