import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_EXPERIMENTAL_SETTINGS,
  normalizeExperimentalSettings,
  type ExperimentalSettings,
} from '../../shared/experimental.js';

/**
 * Experimental feature flags persisted next to the other user settings.
 * Written only from the Settings panel over IPC; the HTTP bridge never mutates it.
 */
import { readJsonFile, writeJsonFileAtomic } from './json-file.js';

export class ExperimentalSettingsStore {
  private settings: ExperimentalSettings = { ...DEFAULT_EXPERIMENTAL_SETTINGS };

  constructor(private readonly file: string) {
    this.load();
  }

  private load(): void {
    const parsed = readJsonFile(this.file);
    this.settings = parsed === null ? { ...DEFAULT_EXPERIMENTAL_SETTINGS } : normalizeExperimentalSettings(parsed);
  }

  private save(): void {
    // A failed write leaves the in-memory value; the next save retries.
    writeJsonFileAtomic(this.file, this.settings);
  }

  get(): ExperimentalSettings {
    return { ...this.settings };
  }

  savePatch(patch: unknown): ExperimentalSettings {
    this.settings = normalizeExperimentalSettings({ ...this.settings, ...(patch as object) });
    this.save();
    return this.get();
  }
}
