import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_ZOOM_SETTINGS,
  normalizeZoomSettings,
  type ZoomSettings,
} from '../../shared/zoom.js';

/**
 * The browser zoom policy lives next to the other human settings. The HTTP
 * bridge may read it through `browser_zoom`, but only the Settings/toolbar IPC
 * path writes the persisted mode.
 */
import { readJsonFile, writeJsonFileAtomic } from '../settings/json-file.js';

export class ZoomSettingsStore {
  private settings: ZoomSettings = { ...DEFAULT_ZOOM_SETTINGS };

  constructor(private readonly file: string) {
    this.load();
  }

  private load(): void {
    const parsed = readJsonFile(this.file);
    this.settings = parsed === null ? { ...DEFAULT_ZOOM_SETTINGS } : normalizeZoomSettings(parsed);
  }

  private save(): void {
    // Keep the in-memory value on failure; the next save retries.
    writeJsonFileAtomic(this.file, this.settings);
  }

  get(): ZoomSettings {
    return { ...this.settings };
  }

  savePatch(patch: unknown): ZoomSettings {
    this.settings = normalizeZoomSettings({ ...this.settings, ...(patch as object) });
    this.save();
    return this.get();
  }
}
