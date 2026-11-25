/**
 * File-backed wrapper store.
 *
 * One file per wrapper under `<userData>/wrap/wrappers/<id>.json`. Writes are
 * atomic (temp file + rename) so an interrupted save cannot leave a half
 * wrapper behind. A malformed file is skipped rather than crashing the bridge;
 * `wrap_get` can still report the validation error if asked directly.
 *
 * Why this file is small: `wrapper-files.ts` owns the directory and the atomic
 * read/write, `manifest.ts` owns the list projection and `validate-wrapper.ts` owns
 * the rules. This class is the create/update/delete policy over them.
 */

import type { WrapManifestEntry, WrapWrapper } from './types.ts';
import { validateWrapper } from './validate-wrapper.ts';
import { manifestOf } from './manifest.ts';
import { WrapperFiles } from './wrapper-files.ts';

/** When to use: a wrapper store mutation — ok plus the saved wrapper or the validation errors. */
export interface StoreResult {
  ok: boolean;
  wrapper?: WrapWrapper;
  errors: string[];
}

/** When to use: `wrap_create`/`wrap_update`/`wrap_delete` — the file-backed wrapper policy. */
export class WrapStore {
  readonly dir: string;
  private readonly files: WrapperFiles;

  constructor(dir: string) {
    this.dir = dir;
    this.files = new WrapperFiles(dir);
  }

  list(): WrapWrapper[] {
    const wrappers: WrapWrapper[] = [];
    for (const file of this.files.paths()) {
      const wrapper = this.files.read(file);
      if (wrapper) wrappers.push(wrapper);
    }
    return wrappers.sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): WrapWrapper | undefined {
    const file = this.files.pathFor(id);
    if (!file) return undefined;
    return this.files.read(file);
  }

  create(input: unknown): StoreResult {
    return this.saveValidated(input, false);
  }

  update(input: unknown): StoreResult {
    return this.saveValidated(input, true);
  }

  /** Validate, enforce the create/update existence rule, then write. */
  private saveValidated(input: unknown, mustExist: boolean): StoreResult {
    const validation = validateWrapper(input);
    if (!validation.ok || !validation.wrapper) return { ok: false, errors: validation.errors };

    const wrapper = validation.wrapper;
    const exists = Boolean(this.get(wrapper.id));
    if (mustExist && !exists) {
      return { ok: false, errors: [`wrapper "${wrapper.id}" does not exist; use wrap_create`] };
    }
    if (!mustExist && exists) {
      return { ok: false, errors: [`wrapper "${wrapper.id}" already exists; use wrap_update`] };
    }

    const written = this.files.write(wrapper);
    return written.ok ? { ok: true, wrapper, errors: [] } : { ok: false, errors: [written.error] };
  }

  delete(id: string): boolean {
    return this.files.remove(id);
  }

  manifest(): WrapManifestEntry[] {
    return this.list().map((wrapper) => manifestOf(wrapper));
  }

  count(): number {
    return this.files.count();
  }

  /** Record a successful live run without going through full validation. */
  touchVerified(id: string, at: string = new Date().toISOString()): boolean {
    const wrapper = this.get(id);
    if (!wrapper) return false;
    return this.files.write({ ...wrapper, lastVerified: at }).ok;
  }
}
