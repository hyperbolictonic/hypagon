/**
 * Shared alert chrome for the settings panels.
 *
 * The settings surface has one result element per panel; they all render the
 * same DaisyUI alert with a tone class. Keeping the class string here stops the
 * panels from drifting apart one hand-written className at a time.
 */

export type AlertKind = 'success' | 'error' | 'info';

/** Show an inline result message; a missing element is a no-op. */
export function showAlert(
  el: HTMLElement | null,
  kind: AlertKind,
  text: string,
  extraClass = '',
): void {
  if (!el) return;
  el.className = `alert alert-${kind} alert-sm font-mono text-xs${extraClass ? ` ${extraClass}` : ''}`;
  el.textContent = text;
  el.classList.remove('hidden');
}

/** The message a failed settings call reports: the validation errors, or the fallback. */
export function validationMessage(result: any, fallback = 'Save failed.'): string {
  return (result?.errors || []).join('; ') || fallback;
}
