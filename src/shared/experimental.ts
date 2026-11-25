/** Experimental features. Everything here is opt-in and may change or be removed. */
export interface ExperimentalSettings {
  /** Collaboration mode (element notes, thread overlays, resolve controls). Off by default. */
  collab: boolean;
}

/** When to use: a first run, or a settings file that could not be read. */
export const DEFAULT_EXPERIMENTAL_SETTINGS: ExperimentalSettings = {
  collab: false,
};

/** When to use: reading the experimental flag — only an explicit true enables collab. */
export function normalizeExperimentalSettings(input: unknown): ExperimentalSettings {
  const source = (input ?? {}) as Partial<ExperimentalSettings>;
  return {
    collab: source.collab === true,
  };
}
