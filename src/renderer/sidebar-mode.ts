/**
 * The sidebar layout: docked / floating / collapsed, its bounds, the orb drag and its state.
 *
 * Reads the shared sidebar state; the entry point calls `applySidebarState` and the toolbar
 * handlers call `toggleSidebar`.
 */
import { sidebarPanel, sidebarRailToggle, sidebarState } from './sidebar-state';
import type { SidebarMode } from './sidebar-state';

/** When to use: reading the sidebar mode requested by the shell URL. */
export const SIDEBAR_MODE = new URLSearchParams(window.location.search).has('sidebar');
document.documentElement.classList.toggle('sidebar-mode', SIDEBAR_MODE);

const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') as HTMLButtonElement | null;
const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn') as HTMLButtonElement | null;
const sidebarDockBtn = document.getElementById('sidebar-dock-btn') as HTMLButtonElement | null;

/** When to use: the sidebar layout changed — apply it to the views. */
export function applySidebarMode(mode: SidebarMode): void {
  sidebarState.mode = mode;
  document.documentElement.classList.toggle('sidebar-collapsed', mode === 'collapsed');
  document.documentElement.classList.toggle('sidebar-docked', mode === 'docked');
  document.documentElement.classList.toggle('sidebar-floating', mode === 'floating');

  // Direct DOM fallback in addition to the CSS mode classes: the native view
  // may receive this before its stylesheet has settled.
  sidebarPanel?.classList.toggle('hidden', mode === 'collapsed');
  if (sidebarRailToggle) {
    sidebarRailToggle.style.display = mode === 'collapsed' ? 'flex' : 'none';
  }

  if (sidebarToggleBtn) {
    sidebarToggleBtn.textContent = mode === 'collapsed' ? '◨' : '◧';
    sidebarToggleBtn.title =
      mode === 'collapsed'
        ? 'Show the Command Deck (Ctrl+Shift+B)'
        : 'Collapse the Command Deck (Ctrl+Shift+B)';
  }

  if (sidebarDockBtn) {
    sidebarDockBtn.textContent = mode === 'docked' ? 'FLOAT' : 'DOCK';
    sidebarDockBtn.disabled = mode === 'collapsed';
  }
}

/** When to use: the sidebar toggle button. */
export function toggleSidebar(): void {
  window.electronAPI?.toggleSidebarMode();
}

sidebarToggleBtn?.addEventListener('click', toggleSidebar);
sidebarCollapseBtn?.addEventListener('click', () => {
  // Apply locally first so the panel gives immediate feedback even if the
  // native bounds update is delayed.
  applySidebarMode('collapsed');
  window.electronAPI?.setSidebarMode('collapsed');
});
sidebarDockBtn?.addEventListener('click', () => {
  const target: SidebarMode = sidebarState.mode === 'docked' ? 'floating' : 'docked';
  applySidebarMode(target);
  window.electronAPI?.setSidebarMode(target);
});
// ---- Deck orb: click restores the deck, press-and-move drags it ----
/** When to use: the chassis reported a new sidebar state. */
export function applySidebarState(state: {
  mode: 'docked' | 'floating' | 'collapsed';
  collabMode: boolean;
  collabEnabled: boolean;
  orbEdge: 'left' | 'right';
}): void {
  applySidebarMode(state.mode);
  document.documentElement.classList.toggle('collab-mode', state.collabMode && state.mode === 'collapsed');
  document.documentElement.classList.toggle('collab-disabled', state.collabEnabled === false);
  sidebarState.collabModeOn = state.collabMode && state.mode === 'collapsed';
  const collabButton = document.getElementById('collab-btn');
  collabButton?.classList.toggle('btn-warning', sidebarState.collabModeOn);
  collabButton?.classList.toggle('btn-ghost', !sidebarState.collabModeOn);
  collabButton?.classList.toggle('text-accent', !sidebarState.collabModeOn);
  collabButton?.setAttribute('aria-pressed', String(sidebarState.collabModeOn));
  sidebarRailToggle?.classList.toggle('orb-left', state.orbEdge === 'left');
  try {
    localStorage.setItem('deck.orb-edge', state.orbEdge);
  } catch {
    /* storage unavailable */
  }
}

sidebarRailToggle?.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const hub = event.currentTarget as HTMLElement;
  // Synthetic pointers (tests, automation) have no active id: ignore the failure.
  try {
    hub.setPointerCapture(event.pointerId);
  } catch {
    /* capture unavailable */
  }
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  const onMove = (moveEvent: PointerEvent) => {
    if (!dragging) {
      if (Math.abs(moveEvent.clientX - startX) + Math.abs(moveEvent.clientY - startY) <= 6) return;
      dragging = true;
      hub.classList.add('orb-dragging');
    }
    window.electronAPI?.orbitDragMove(moveEvent.movementX, moveEvent.movementY);
  };
  const onUp = () => {
    hub.classList.remove('orb-dragging');
    hub.removeEventListener('pointermove', onMove);
    hub.removeEventListener('pointerup', onUp);
    hub.removeEventListener('pointercancel', onUp);
    if (dragging) {
      dragging = false;
      window.electronAPI?.orbitDragEnd();
      return;
    }
    window.electronAPI?.setSidebarMode('floating');
  };
  hub.addEventListener('pointermove', onMove);
  hub.addEventListener('pointerup', onUp);
  hub.addEventListener('pointercancel', onUp);
});
sidebarRailToggle?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    window.electronAPI?.setSidebarMode('floating');
  }
});
