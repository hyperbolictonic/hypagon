/**
 * Shared JSON settings plumbing.
 *
 * Every persisted settings module follows the same shape: read a file, run a
 * normalizer, fall back to defaults when the file is missing or corrupt, and
 * write atomically with a reported failure. Keeping that skeleton here stops
 * each store from growing its own subtly different copy.
 */
import fs from 'node:fs';
import { writeJsonAtomic } from '../data-paths.ts';

/** The result every settings normalizer returns. */
export interface SettingsResult<T> {
  ok: boolean;
  settings: T;
  errors: string[];
}

/** Read and normalize a settings file; a missing or corrupt file yields defaults. */
export function loadJsonSettings<T>(
  file: string,
  normalize: (input: unknown) => SettingsResult<T>,
  defaults: () => T,
): T {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const normalized = normalize(parsed);
    return normalized.ok ? normalized.settings : defaults();
  } catch {
    return defaults();
  }
}

/** Normalize and atomically write; a write failure is reported in the result. */
export function saveJsonSettings<T>(
  file: string,
  label: string,
  input: unknown,
  normalize: (input: unknown) => SettingsResult<T>,
): SettingsResult<T> {
  const normalized = normalize(input);
  if (!normalized.ok) return normalized;
  try {
    writeJsonAtomic(file, normalized.settings);
    return normalized;
  } catch (err: any) {
    return { ...normalized, ok: false, errors: [`Could not save ${label}: ${err?.message || err}`] };
  }
}

/** The object-shape guard every settings normalizer shares; null means "not an object". */
export function settingsSource(input: unknown): Record<string, any> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  return input as Record<string, any>;
}
