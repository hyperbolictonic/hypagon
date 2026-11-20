/**
 * The shared settings result line under the decision-model form.
 *
 * The decision tab and the JEV controls both report through it, so it lives apart from both.
 */

const resultEl = document.getElementById('settings-test-result') as HTMLElement;

/** When to use: a settings action's outcome — one alert line with the right severity. */
/** When to use: the settings modal opens — hide any result line left from the last session. */
export function resetSettingsResult(): void {
  resultEl.className = 'alert alert-ghost alert-sm font-mono text-xs hidden';
}

/** When to use: a settings action's outcome — one alert line with the right severity. */
export function showSettingsResult(kind: 'success' | 'error' | 'info', text: string): void {
  resultEl.className = `alert alert-${kind} alert-sm font-mono text-xs`;
  resultEl.textContent = text;
}
