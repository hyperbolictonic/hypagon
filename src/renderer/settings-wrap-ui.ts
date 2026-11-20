/**
 * The wrapper panel's cross-module hooks.
 *
 * The form and the list are mutually recursive (filling the form repaints the list, and the list
 * opens the form), so they call each other through this object instead of importing each other.
 */

/** When to use: filling the form, repainting the list, opening the modal or showing a result. */
export interface WrapUi {
  refreshList: () => void;
  refreshAuthOptions: (selected?: string) => void;
  showResult: (kind: 'success' | 'error' | 'info', text: string) => void;
  openModal: () => void;
  fillForm: (wrapper: any | null) => void;
}

/** When to use: registered once by the entry point, read by both modules. */
export const wrapUi: Partial<WrapUi> = {};
