/**
 * The page-zoom controls: the level readout, the in/out actions and the pinned-mode toggle.
 *
 * Owns its state and looks up the three buttons itself; the entry point only calls `renderZoom`
 * and `setZoomPinned` when chassis state changes.
 */
import type { ZoomState } from '../shared/zoom.js';

const zoomOutBtn = document.getElementById('zoom-out') as HTMLButtonElement | null;
const zoomInBtn = document.getElementById('zoom-in') as HTMLButtonElement | null;
const zoomLevelBtn = document.getElementById('zoom-level') as HTMLButtonElement | null;

let currentZoom: ZoomState | null = null;

/** When to use: the zoom state changed — repaint the level button. */
export function renderZoom(zoom: ZoomState | null | undefined): void {
  if (!zoom) return;
  currentZoom = zoom;
  const percent = Math.round(zoom.factor * 100);
  if (zoomLevelBtn) {
    zoomLevelBtn.textContent = `${percent}%`;
    zoomLevelBtn.title = `Reset page zoom to the ${zoom.mode === 'compensate' ? 'fitted' : 'Windows'} default (Ctrl+0)`;
  }
  if (zoomOutBtn) zoomOutBtn.title = `Zoom out (Ctrl+-) - ${percent}%`;
  if (zoomInBtn) zoomInBtn.title = `Zoom in (Ctrl+=) - ${percent}%`;
}

/** When to use: a zoom button was pressed — apply the action to the chassis. */
export async function applyZoomAction(action: 'in' | 'out' | 'reset'): Promise<void> {
  try {
    renderZoom(await window.electronAPI?.setZoom?.({ action }));
  } catch {
    // A render surface can race a window reload; the next state broadcast wins.
  }
}

/** Page zoom is pinned while a device viewport is emulated. */
/** When to use: the zoom mode is pinned or released. */
export function setZoomPinned(pinned: boolean): void {
  for (const control of [zoomOutBtn, zoomInBtn, zoomLevelBtn]) {
    if (!control) continue;
    control.disabled = pinned;
    if (pinned) control.title = 'Page zoom is pinned to 100% while a responsive device is active';
  }
  if (!pinned) renderZoom(currentZoom);
}

zoomOutBtn?.addEventListener('click', () => void applyZoomAction('out'));
zoomInBtn?.addEventListener('click', () => void applyZoomAction('in'));
zoomLevelBtn?.addEventListener('click', () => void applyZoomAction('reset'));
