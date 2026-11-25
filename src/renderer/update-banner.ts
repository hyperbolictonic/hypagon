/**
 * Auto-update banner.
 *
 * Mirrors the main process updater state in the toolbar badge and the banner:
 * checking, downloading, ready-to-restart, and failure. The main process
 * disables updates in development, so the banner stays hidden there.
 */
import type { ElectronAPI } from '../preload/index.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

const updateBanner = document.getElementById('update-banner') as HTMLElement | null;
const updateText = document.getElementById('update-text') as HTMLElement | null;
const updateAction = document.getElementById('update-action') as HTMLButtonElement | null;
const updateBadge = document.getElementById('update-badge') as HTMLButtonElement | null;
let lastUpdateState: any = null;

/** Paint the badge in one tone; the state machine below only supplies the parts. */
function paintUpdateBadge(
  text: string,
  tone: 'badge-info' | 'badge-warning' | 'badge-success' | 'badge-error',
  disabled: boolean,
  title: string,
): void {
  if (!updateBadge) return;
  updateBadge.textContent = text;
  updateBadge.classList.add(tone);
  updateBadge.disabled = disabled;
  updateBadge.title = title;
}

function renderUpdateBadge(state: any): void {
  if (!updateBadge) return;
  const status = state?.status;
  const version = state?.version ? ` v${state.version}` : '';
  updateBadge.classList.remove('hidden', 'badge-info', 'badge-warning', 'badge-success', 'badge-error');
  if (status === 'checking') {
    paintUpdateBadge('CHECKING UPDATE', 'badge-info', true, 'Checking GitHub Releases for a newer version.');
  } else if (status === 'available') {
    paintUpdateBadge(`UPDATE${version}`, 'badge-info', true, 'Update found; downloading now.');
  } else if (status === 'downloading') {
    paintUpdateBadge(
      `DOWNLOADING${state.percent ? ` ${state.percent}%` : ''}`,
      'badge-warning',
      true,
      'Downloading the update in the background.',
    );
  } else if (status === 'ready') {
    paintUpdateBadge(`RESTART${version}`, 'badge-success', false, 'Update downloaded. Click to restart and install.');
  } else if (status === 'error') {
    paintUpdateBadge('UPDATE FAILED', 'badge-error', true, state?.message || 'Update check failed.');
  } else {
    updateBadge.classList.add('hidden');
    updateBadge.disabled = true;
    updateBadge.textContent = '';
  }
}

function renderUpdateState(state: any) {
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

async function restartForUpdate(): Promise<void> {
  if (lastUpdateState?.status !== 'ready') return;
  if (updateAction) {
    updateAction.disabled = true;
    updateAction.textContent = 'RESTARTING…';
  }
  if (updateBadge) {
    updateBadge.disabled = true;
    updateBadge.textContent = 'RESTARTING…';
  }
  await api?.installUpdate();
}


/** Wire the banner and the install action once. */
export function initUpdateBanner(): void {
  updateAction?.addEventListener('click', () => void restartForUpdate());
  updateBadge?.addEventListener('click', () => void restartForUpdate());

  api?.onUpdateStatus(renderUpdateState);
  api?.getUpdateStatus().then(renderUpdateState).catch(() => {});

}
