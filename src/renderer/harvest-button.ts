/**
 * The Harvest button: run a construct harvest, then jump to the CONSTRUCT tab.
 *
 * Owns the button; the entry point reads it for the keyboard shortcut.
 */
import { renderConstruct } from './telemetry-feed';

/** When to use: main registers the tab switcher so a harvest can reveal the CONSTRUCT tab. */
let showConstructTab: () => void = () => {};

/** When to use: once at boot, with the entry point's switchTab. */
export function setHarvestTabSink(fn: () => void): void {
  showConstructTab = fn;
}

/** When to use: the toolbar Harvest button, also triggered by the keyboard shortcut. */
export const harvestBtn = document.getElementById('harvest-btn') as HTMLButtonElement;

harvestBtn.addEventListener('click', async () => {
  if (window.electronAPI) {
    const icon = document.getElementById('harvest-icon');
    const spinner = document.getElementById('harvest-spinner');
    harvestBtn.disabled = true;
    icon?.classList.add('hidden');
    spinner?.classList.remove('hidden');
    try {
      const construct = await window.electronAPI.harvest();
      renderConstruct(construct);
      showConstructTab();
    } finally {
      harvestBtn.disabled = false;
      spinner?.classList.add('hidden');
      icon?.classList.remove('hidden');
    }
  }
});
