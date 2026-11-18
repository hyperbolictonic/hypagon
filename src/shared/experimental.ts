/** Experimental features. Everything here is opt-in and may change or be removed. */
export interface ExperimentalSettings {
  /** Collaboration mode (element notes, thread overlays, resolve controls). Off by default. */
  collab: boolean;
}

/** When to use: a fresh profile or a reset to experimental defaults. */
export const DEFAULT_EXPERIMENTAL_SETTINGS: ExperimentalSettings = {
  collab: false,
};

/** When to use: validating experimental flags from disk or IPC. */
export function normalizeExperimentalSettings(input: unknown): ExperimentalSettings {
  const source = (input ?? {}) as Partial<ExperimentalSettings>;
  return {
    collab: source.collab === true,
  };
}
