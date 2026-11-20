/**
 * Shared state for the wrap/secrets settings panel.
 *
 * The secrets form and the wrapper modal both read the saved list and the selected wrapper, so the
 * state lives here rather than in the entry point; neither module has to import the other.
 */

/** When to use: reading or replacing the saved wrapper list and the current selection. */
export const wrapState: { wrappers: any[]; selectedId: string | null } = {
  wrappers: [],
  selectedId: null,
};
