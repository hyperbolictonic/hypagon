/**
 * The auto-update banner: availability, download progress and the restart action.
 *
 * Owns its elements and its last-known state; the entry point imports it for the side effects and
 * pushes nothing in.
 */
import { BRAND } from '../shared/brand.js';

const updateBanner = document.getElementById('update-banner') as HTMLElement | null;
const updateText = document.getElementById('update-text') as HTMLElement | null;
const updateAction = document.getElementById('update-action') as HTMLButtonElement | null;
const updateBadge = document.getElementById('update-badge') as HTMLButtonElement | null;
let lastUpdateState: any = null;

/** When to use: the update badge state changed. */
export function renderUpdateBadge(state: any): void {
  if (!updateBadge) return;
  const status = state?.status;
  const version = state?.version ? ` v${state.version}` : '';
  const badge = updateBadge;
  badge.classList.remove('hidden', 'badge-info', 'badge-warning', 'badge-success', 'badge-error');

  const show = (label: string, tone: string, disabled: boolean, title: string) => {
    badge.textContent = label;
    badge.classList.add(tone);
    badge.disabled = disabled;
    badge.title = title;
  };

  if (status === 'checking') show('CHECKING UPDATE', 'badge-info', true, 'Checking GitHub Releases for a newer version.');
  else if (status === 'available') show(`UPDATE${version}`, 'badge-info', true, 'Update found; downloading now.');
  else if (status === 'downloading') show(`DOWNLOADING${state.percent ? ` ${state.percent}%` : ''}`, 'badge-warning', true, 'Downloading the update in the background.');
  else if (status === 'error') show('UPDATE FAILED', 'badge-error', true, state?.message || 'Update check failed.');
  else {
    badge.classList.add('hidden');
    badge.disabled = true;
    badge.textContent = '';
  }
}

/** When to use: the main process reported an update state. */
export function renderUpdateState(state: any) {
  lastUpdateState = state;
  renderUpdateBadge(state);
  if (!updateBanner || !updateText || !updateAction) return;
  const show = (text: string, withAction = false) => {
    updateText.textContent = text;
    updateBanner.classList.remove('hidden');
    updateBanner.classList.add('flex');
    updateAction.classList.toggle('hidden', !withAction);
  };
  const hide = () => {
    updateBanner.classList.add('hidden');
    updateBanner.classList.remove('flex');
  };

  switch (state?.status) {
    case 'checking':
      hide();
      break;
    case 'available':
      show(`Update ${state.version ? `v${state.version}` : ''} found — downloading…`);
      break;
    case 'downloading':
      show(`Downloading update${state.percent ? ` ${state.percent}%` : ''}…`);
      break;
    case 'ready':
      show(`Update ${state.version ? `v${state.version}` : ''} ready`, true);
      break;
    default:
      // idle / disabled / error stay quiet — there is nothing for the human to do.
      hide();
  }
}

/** When to use: the user accepted an update — install it and restart. */
export async function restartForUpdate(): Promise<void> {
  if (lastUpdateState?.status !== 'ready') return;
  if (updateAction) {
    updateAction.disabled = true;
    updateAction.textContent = 'RESTARTING…';
  }
  if (updateBadge) {
    updateBadge.disabled = true;
    updateBadge.textContent = 'RESTARTING…';
  }
  await window.electronAPI?.installUpdate();
}

updateAction?.addEventListener('click', () => void restartForUpdate());
updateBadge?.addEventListener('click', () => void restartForUpdate());

window.electronAPI?.onUpdateStatus(renderUpdateState);
