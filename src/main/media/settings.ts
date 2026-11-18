/**
 * Media settings, stored next to the other user settings.
 *
 * Written only from the Settings panel over IPC. The bridge may read the
 * resulting auto-update state, but it never changes a setting.
 */


import path from 'node:path';
import type { MediaSettings } from '../../shared/media.ts';
import { readJsonFile, writeJsonFileAtomic } from '../settings/json-file.js';

/** When to use: a fresh profile or a reset to the shipped media defaults. */
export const DEFAULT_MEDIA_SETTINGS: MediaSettings = {
  autoUpdate: true,
  updateIntervalMinutes: 60,
  useSessionCookies: false,
  outputDir: '',
  ffmpegMode: 'auto',
  ffmpegPath: '',
};

const MIN_INTERVAL_MINUTES = 15;
const MAX_INTERVAL_MINUTES = 24 * 60;

/** When to use: validating media settings from disk or IPC before applying them. */
export function normalizeMediaSettings(input: unknown): MediaSettings {
  const raw = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const autoUpdate = typeof raw.autoUpdate === 'boolean' ? raw.autoUpdate : DEFAULT_MEDIA_SETTINGS.autoUpdate;
  const requested = Number(raw.updateIntervalMinutes);
  const interval = Number.isFinite(requested)
    ? Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(requested)))
    : DEFAULT_MEDIA_SETTINGS.updateIntervalMinutes;
  const useSessionCookies =
    typeof raw.useSessionCookies === 'boolean' ? raw.useSessionCookies : DEFAULT_MEDIA_SETTINGS.useSessionCookies;
  const outputDir =
    typeof raw.outputDir === 'string' && raw.outputDir.trim() !== '' && path.isAbsolute(raw.outputDir.trim())
      ? raw.outputDir.trim()
      : '';
  const ffmpegMode: MediaSettings['ffmpegMode'] =
    raw.ffmpegMode === 'path' || raw.ffmpegMode === 'managed' ? raw.ffmpegMode : 'auto';
  const ffmpegPath = typeof raw.ffmpegPath === 'string' ? raw.ffmpegPath.trim() : '';
  return { autoUpdate, updateIntervalMinutes: interval, useSessionCookies, outputDir, ffmpegMode, ffmpegPath };
}

/** When to use: reading or saving media settings (IPC only), or building one in tests. */
export class MediaSettingsStore {
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  load(): MediaSettings {
    const parsed = readJsonFile(this.file);
    return parsed === null ? { ...DEFAULT_MEDIA_SETTINGS } : normalizeMediaSettings(parsed);
  }

  save(patch: unknown): MediaSettings {
    const next = normalizeMediaSettings({ ...this.load(), ...(patch as Record<string, unknown>) });
    // The caller still gets the normalised value; a failed write leaves the old file
    // in place and the next save retries.
    writeJsonFileAtomic(this.file, next);
    return next;
  }
}
