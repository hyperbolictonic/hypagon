import fs from 'node:fs';
import path from 'node:path';

export type JevMode = 'prefer' | 'enforce';

export interface JevSettings {
  /** Hard on/off. Off gates the JEV tools off and never touches observe. */
  power: boolean;
  /** How reads are steered while power is on. */
  mode: JevMode;
}

export const DEFAULT_JEV_SETTINGS: JevSettings = { power: false, mode: 'prefer' };

const isMode = (value: unknown): value is JevMode => value === 'prefer' || value === 'enforce';

/**
 * JEV is an optional feature (not an experimental one): it is offered only when
 * a decision model is configured, and stays off until the human opts in.
 * Written only from the Settings panel over IPC.
 *
 * `power` is the master switch; `mode` only matters while it is on. A legacy
 * `{ enabled: true }` file migrates to prefer — never silently to enforce.
 */
import { readJsonFile, writeJsonFileAtomic } from './json-file.js';

export class JevSettingsStore {
  private settings: JevSettings = { ...DEFAULT_JEV_SETTINGS };
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    this.load();
  }

  private load(): void {
    const parsed = readJsonFile(this.file) as Record<string, any> | null;
    this.settings = parsed
      ? {
          power: parsed?.power === true || parsed?.enabled === true,
          mode: isMode(parsed?.mode) ? parsed.mode : 'prefer',
        }
      : { ...DEFAULT_JEV_SETTINGS };
  }

  private save(): void {
    // Keep the in-memory value on failure; the next save retries.
    writeJsonFileAtomic(this.file, this.settings);
  }

  get(): JevSettings {
    return { ...this.settings };
  }

  savePatch(patch: unknown): JevSettings {
    const next = (patch ?? {}) as { power?: unknown; mode?: unknown; enabled?: unknown };
    const power = next.power !== undefined ? next.power === true : next.enabled === true ? true : this.settings.power;
    const mode = isMode(next.mode) ? next.mode : this.settings.mode;
    this.settings = { power, mode };
    this.save();
    return this.get();
  }
}
