/**
 * The docked HIL panel: the reason line, resume/cancel/reload actions and the sidebar mode it
 * temporarily replaces.
 *
 * Owns its elements and its restore state; the entry point pushes HIL updates in through
 * `setDeckHilMode`.
 */
import { sidebarPanel, sidebarRailToggle, sidebarState } from './sidebar-state';
import type { SidebarMode } from './sidebar-state';
import { applySidebarState, SIDEBAR_MODE, toggleSidebar } from './sidebar-mode';
import { applySidebarMode } from './sidebar-mode';

const hilPanel = document.getElementById('hil-panel');
const hilPanelReason = document.getElementById('hil-panel-reason');
const hilPanelResume = document.getElementById('hil-panel-resume');
const hilPanelCancel = document.getElementById('hil-panel-cancel');
const hilPanelReload = document.getElementById('hil-panel-reload');

/** The mode the deck had before a hand-off forced it docked; restored on clear. */
let hilRestoreMode: SidebarMode | null = null;

/**
 * Swap the Command Deck into its hand-off variant.
 *
 * The deck is the one HIL surface: a slim docked panel replaces its body while the
 * agent waits, and the previous content comes back untouched on clear. Nothing is
 * injected into the page and nothing floats over it, so the page a human needs to
 * look at stays fully readable. Only the sidebar document owns this state.
 */
/** When to use: the chassis reported a HIL request (or its resolution). */
export function setDeckHilMode(active: boolean, reason?: string): void {
  if (!SIDEBAR_MODE || !sidebarPanel || !hilPanel) return;
  for (const child of Array.from(sidebarPanel.children)) {
    const el = child as HTMLElement;
    if (el.id === 'hil-panel') continue;
    el.style.display = active ? 'none' : '';
  }
  hilPanel.classList.toggle('hidden', !active);
  hilPanel.classList.toggle('flex', active);
  if (active && reason && hilPanelReason) {
    hilPanelReason.textContent = reason;
  }
  if (active) {
    // A hand-off must be visible: bring the deck into its docked slot, remembering
    // where it was so the user's layout comes back afterwards.
    if (sidebarState.mode !== 'docked') {
      hilRestoreMode = sidebarState.mode;
      applySidebarMode('docked');
      window.electronAPI?.setSidebarMode('docked');
    }
  } else if (hilRestoreMode) {
    applySidebarMode(hilRestoreMode);
    window.electronAPI?.setSidebarMode(hilRestoreMode);
    hilRestoreMode = null;
  }
}

window.electronAPI?.onHilRequested((request) => {
  sidebarRailToggle?.classList.add('is-hil');
  setDeckHilMode(true, request?.reason || 'Human intervention required');
});
window.electronAPI?.onHilCleared(() => {
  sidebarRailToggle?.classList.remove('is-hil');
  setDeckHilMode(false);
});
hilPanelResume?.addEventListener('click', () => {
  void window.electronAPI?.resolveHil();
});
hilPanelCancel?.addEventListener('click', () => {
  void window.electronAPI?.cancelHil();
});
hilPanelReload?.addEventListener('click', () => {
  void window.electronAPI?.reloadHil();
});
// A hand-off raised before this document finished loading must still show.
if (SIDEBAR_MODE) {
  window.electronAPI?.getActiveHil().then((active) => {
    if (active?.id) {
      sidebarRailToggle?.classList.add('is-hil');
      setDeckHilMode(true, active.reason || 'Human intervention required');
    }
  }).catch(() => undefined);
}
try {
  const savedEdge = localStorage.getItem('deck.orb-edge');
  if (savedEdge === 'left' || savedEdge === 'right') {
    window.electronAPI?.setSidebarOrbEdge(savedEdge);
  }
} catch {
  /* storage unavailable */
}

window.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    toggleSidebar();
  }
});

// Paint the overlay in its intended translucent state before the async mode
// round-trip. If the main process reports docked/collapsed, the response
// replaces this immediately.
if (SIDEBAR_MODE) applySidebarMode('floating');
window.electronAPI?.getSidebarState?.().then(applySidebarState).catch(() => undefined);
window.electronAPI?.onSidebarState(applySidebarState);
