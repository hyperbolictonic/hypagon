/**
 * Human-input pacing profile — the knobs behind the humanised mouse and keyboard.
 *
 * The type, defaults and clamping live in the stealth package; this module is the app's store in
 * `data/input-profile.json` (gitignored), the same convention as `data/decision.json`.
 * Environment overrides win for one-off runs:
 *   KUANG_MOUSE_SPEED_PX_S, KUANG_TYPING_WPM, KUANG_CLICK_DWELL_MS, KUANG_CURSOR_BUDGET_MS
 */
import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../data-paths.js';
import {
  DEFAULT_INPUT_PROFILE,
  clampInputProfileValue,
  mergeInputProfile,
  type InputProfile,
} from '../../../packages/stealth/src/input/profile.ts';

export type { InputProfile } from '../../../packages/stealth/src/input/profile.ts';
export { DEFAULT_INPUT_PROFILE } from '../../../packages/stealth/src/input/profile.ts';

const CONFIG_FILE = dataPath('input-profile.json');

function envOverride(key: keyof InputProfile): number | undefined {
  const name =
    key === 'mouseSpeedPxPerSec'
      ? 'KUANG_MOUSE_SPEED_PX_S'
      : key === 'typingWpm'
        ? 'KUANG_TYPING_WPM'
        : 'KUANG_CLICK_DWELL_MS';
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Resolve the active profile: defaults, then the file, then env overrides.
 * Never throws — a corrupt file falls back to the defaults so input keeps working.
 */
export function loadInputProfile(): InputProfile {
  let merged: InputProfile = { ...DEFAULT_INPUT_PROFILE };
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Partial<InputProfile>;
      merged = mergeInputProfile(merged, parsed).profile;
    }
  } catch {
    // keep defaults
  }
  for (const key of Object.keys(DEFAULT_INPUT_PROFILE) as Array<keyof InputProfile>) {
    const value = envOverride(key);
    if (value !== undefined) merged[key] = clampInputProfileValue(key, value);
  }
  return merged;
}

/** Persist a (partial) profile, clamped, and return the profile that is now active. */
export function saveInputProfile(patch: Partial<InputProfile>): { ok: boolean; profile: InputProfile; errors: string[] } {
  const { profile: next, errors } = mergeInputProfile(loadInputProfile(), patch);

  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    errors.push(`could not write input profile: ${(err as Error)?.message || err}`);
  }

  return { ok: errors.length === 0, profile: loadInputProfile(), errors };
}
