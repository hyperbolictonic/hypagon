/**
 * The human-input pacing profile.
 *
 * These exist because "humanlike" is a dial, not a constant. A gaming mouse at
 * 1200+ dpi crosses 500px in ~250ms, while a slow glide can cost a second per
 * click and make a 10-step flow feel broken. The defaults aim at a *comfortable
 * fast* human; a host persists whatever the user tunes.
 *
 * Portable: no filesystem, no Electron. The host loads and stores the profile and
 * uses these helpers to clamp and validate it.
 */

/** When to use: the human input simulator and Settings → Input — pointer speed, typing pace and click dwell. */
export interface InputProfile {
  /** Pointer speed used to derive the glide budget for a given distance. */
  mouseSpeedPxPerSec: number;
  /** Typing cadence, in words per minute (5 chars/word). 160 wpm ≈ 37ms per character. */
  typingWpm: number;
  /** Pause between mouse-down and mouse-up. */
  clickDwellMs: number;
}

/** When to use: Settings → Input's initial values and the fallback when no profile is stored. */
export const DEFAULT_INPUT_PROFILE: InputProfile = {
  mouseSpeedPxPerSec: 1400,
  typingWpm: 160,
  clickDwellMs: 55,
};

/** Bounds are deliberately generous but finite: 0 would mean "no dwell at all". */
const BOUNDS: Record<keyof InputProfile, { min: number; max: number }> = {
  mouseSpeedPxPerSec: { min: 200, max: 6000 },
  typingWpm: { min: 40, max: 600 },
  clickDwellMs: { min: 0, max: 300 },
};

/** Clamp one setting into its supported range and round it. */
export function clampInputProfileValue(key: keyof InputProfile, value: number): number {
  const { min, max } = BOUNDS[key];
  return Math.round(Math.min(max, Math.max(min, value)));
}

/**
 * Merge a partial patch into a profile.
 *
 * Non-finite numbers are rejected with one error per field; everything else is
 * clamped. The caller keeps its own storage and environment overrides.
 */
export function mergeInputProfile(
  base: InputProfile,
  patch: Partial<InputProfile>,
): { profile: InputProfile; errors: string[] } {
  const profile: InputProfile = { ...base };
  const errors: string[] = [];
  for (const key of Object.keys(BOUNDS) as Array<keyof InputProfile>) {
    const raw = patch[key];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      errors.push(`${key} must be a number`);
      continue;
    }
    profile[key] = clampInputProfileValue(key, raw);
  }
  return { profile, errors };
}
