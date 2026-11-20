/**
 * The JEV (Just-Enough-View) settings controls: enable/disable and the prefer/enforce mode.
 *
 * Owns its four elements and its mode painting; exports `loadJevSettings` for the settings tab
 * switcher and `saveJevMode` for the mode buttons.
 */

const jevToggle = document.getElementById('settings-jev-enabled') as HTMLInputElement | null;
  const jevStatusEl = document.getElementById('settings-jev-status');
  const jevModePrefer = document.getElementById('settings-jev-mode-prefer') as HTMLButtonElement | null;
  const jevModeEnforce = document.getElementById('settings-jev-mode-enforce') as HTMLButtonElement | null;

  const paintJevMode = (mode: 'prefer' | 'enforce', locked: boolean) => {
    const pairs: Array<[HTMLButtonElement | null, boolean]> = [
      [jevModePrefer, mode === 'prefer'],
      [jevModeEnforce, mode === 'enforce'],
    ];
    for (const [button, active] of pairs) {
      if (!button) continue;
      button.classList.toggle('btn-active', active);
      button.classList.toggle('btn-primary', active);
      button.setAttribute('aria-pressed', String(active));
      button.disabled = locked;
    }
  };

  /** JEV is optional: only offerable once a decision model is configured. */
  const applyJevSettings = (result: any) => {
    const power = result?.settings?.power === true;
    const mode: 'prefer' | 'enforce' = result?.settings?.mode === 'enforce' ? 'enforce' : 'prefer';
    const decisionConfigured = result?.decisionConfigured === true;
    if (jevToggle) {
      jevToggle.checked = power;
      jevToggle.disabled = !decisionConfigured;
    }
    paintJevMode(mode, !decisionConfigured || !power);
    if (jevStatusEl) {
      jevStatusEl.textContent = !decisionConfigured
        ? 'Requires a configured decision model.'
        : !power
          ? 'OFF — agents receive full page markdown.'
          : mode === 'enforce'
            ? 'ENFORCE — unscoped page reads are refused; the agent must use jev_index + read_section.'
            : 'PREFER — tools lead with the index; full-page reads are still allowed.';
    }
  };
  /** When to use: the Settings → JEV controls are shown — read the stored mode. */
export const loadJevSettings = async (): Promise<void> => {
    try {
      applyJevSettings(await window.electronAPI!.getJevSettings());
    } catch {
      // Best effort: the toggle keeps its last state.
    }
  };
  jevToggle?.addEventListener('change', async () => {
    if (!jevToggle) return;
    const result = await window.electronAPI?.saveJevSettings({ power: jevToggle.checked });
    if (result?.ok) applyJevSettings(result);
    else jevToggle.checked = !jevToggle.checked;
  });
  const saveJevMode = async (mode: 'prefer' | 'enforce') => {
    const result = await window.electronAPI?.saveJevSettings({ mode });
    if (result?.ok) applyJevSettings(result);
  };
  jevModePrefer?.addEventListener('click', () => void saveJevMode('prefer'));
  jevModeEnforce?.addEventListener('click', () => void saveJevMode('enforce'));
  window.electronAPI?.onJevSettings(() => void loadJevSettings());
