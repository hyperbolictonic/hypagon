/**
 * The Command Deck shell: sidebar modes, the orb (rail), the collaboration toolbar and the
 * experimental collab flag.
 *
 * Why a module: all of it is one surface with one mode variable. The HUD only asks this module
 * to apply a state and to dim the orb while a human hand-off is pending.
 */
import { SIDEBAR_MODE } from './mode.js';

type SidebarMode = 'docked' | 'floating' | 'collapsed';

const sidebarPanel = document.getElementById('sidebar-panel') as HTMLElement | null;
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') as HTMLButtonElement | null;
const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn') as HTMLButtonElement | null;
const sidebarDockBtn = document.getElementById('sidebar-dock-btn') as HTMLButtonElement | null;
const sidebarRailToggle = document.getElementById('sidebar-rail-toggle') as HTMLButtonElement | null;

let currentSidebarMode: SidebarMode = 'floating';
let collabModeOn = false;

/** When to use: `applySidebarState`, the collapse/dock buttons and the boot restyle. */
export function applySidebarMode(mode: SidebarMode): void {
  currentSidebarMode = mode;
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

function toggleSidebar(): void {
  window.electronAPI?.toggleSidebarMode();
}

/** When to use: the main process reports the deck's mode, collab flag and orb edge. */
export function applySidebarState(state: {
  mode: 'docked' | 'floating' | 'collapsed';
  collabMode: boolean;
  collabEnabled: boolean;
  orbEdge: 'left' | 'right';
}): void {
  applySidebarMode(state.mode);
  document.documentElement.classList.toggle('collab-mode', state.collabMode && state.mode === 'collapsed');
  document.documentElement.classList.toggle('collab-disabled', state.collabEnabled === false);
  collabModeOn = state.collabMode && state.mode === 'collapsed';
  const collabButton = document.getElementById('collab-btn');
  collabButton?.classList.toggle('btn-warning', collabModeOn);
  collabButton?.classList.toggle('btn-ghost', !collabModeOn);
  collabButton?.classList.toggle('text-accent', !collabModeOn);
  collabButton?.setAttribute('aria-pressed', String(collabModeOn));
  sidebarRailToggle?.classList.toggle('orb-left', state.orbEdge === 'left');
  try {
    localStorage.setItem('deck.orb-edge', state.orbEdge);
  } catch {
    /* storage unavailable */
  }
}

/** When to use: a human hand-off started or cleared — paints the orb's status light. */
export function markHilActive(active: boolean): void {
  if (active) sidebarRailToggle?.classList.add('is-hil');
  else sidebarRailToggle?.classList.remove('is-hil');
}

/** Experimental flag UI: hide collab entry points unless the flag is on. */
export function applyExperimentalSettings(settings: { collab?: boolean } | null | undefined): void {
  const collabEnabled = settings?.collab === true;
  document.documentElement.classList.toggle('collab-disabled', !collabEnabled);
  const toggle = document.getElementById('settings-experimental-collab') as HTMLInputElement | null;
  if (toggle) toggle.checked = collabEnabled;
  const status = document.getElementById('settings-experimental-status');
  if (status) {
    status.textContent = collabEnabled
      ? 'ON — collab entry points are visible'
      : 'OFF — collab entry points are hidden';
  }
  for (const id of ['collab-count', 'deck-orb-count']) {
    if (!collabEnabled) document.getElementById(id)?.classList.add('hidden');
  }
  if (collabEnabled) void refreshCollaborationCount();
}

async function refreshCollaborationCount(): Promise<void> {
  const result = await window.electronAPI?.listCollaborationThreads({});
  if (!result?.ok) return;
  const openCount = (result.threads || []).filter((thread) => thread.status !== 'resolved').length;
  for (const id of ['collab-count', 'deck-orb-count']) {
    const badge = document.getElementById(id);
    if (!badge) continue;
    badge.textContent = String(openCount);
    badge.classList.toggle('hidden', openCount === 0);
  }
}

/** The orb: click restores the deck, press-and-move drags it. */
function wireOrb(): void {
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
}

/** The collaboration toolbar: [(‹) prev] [(›) next] [list] [pen] [ESC]. */
function wireCollabToolbar(): void {
  document.getElementById('collab-btn')?.addEventListener('click', () => window.electronAPI?.setCollabMode(true));
  document.getElementById('collab-prev-btn')?.addEventListener('click', () => window.electronAPI?.collabNavigate(-1));
  document.getElementById('collab-next-btn')?.addEventListener('click', () => window.electronAPI?.collabNavigate(1));
  document.getElementById('collab-list-btn')?.addEventListener('click', () => window.electronAPI?.collabToggleList());
  document.getElementById('collab-pick-btn')?.addEventListener('click', () => void window.electronAPI?.startCollaborationPicker());
  document.getElementById('collab-exit-btn')?.addEventListener('click', () => window.electronAPI?.setCollabMode(false));
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.activeElement instanceof HTMLInputElement) return;
    if (document.activeElement instanceof HTMLTextAreaElement) return;
    // Deck focus owns Escape while the note picker/toolbar is in play.
    if (collabModeOn) window.electronAPI?.setCollabMode(false);
    else window.electronAPI?.escapeCollabUi();
  });
}

/** When to use: the HUD boot — wire the shell and paint its first state. */
export function initSidebar(): void {
  sidebarToggleBtn?.addEventListener('click', toggleSidebar);
  sidebarCollapseBtn?.addEventListener('click', () => {
    // Apply locally first so the panel gives immediate feedback even if the
    // native bounds update is delayed.
    applySidebarMode('collapsed');
    window.electronAPI?.setSidebarMode('collapsed');
  });
  sidebarDockBtn?.addEventListener('click', () => {
    const target: SidebarMode = currentSidebarMode === 'docked' ? 'floating' : 'docked';
    applySidebarMode(target);
    window.electronAPI?.setSidebarMode(target);
  });

  wireOrb();
  wireCollabToolbar();

  // Orb status light for a running timelapse (the docked side is `applySidebarState`).
  window.electronAPI?.onRecordingStatus((state: unknown) => {
    sidebarRailToggle?.classList.toggle('is-recording', Boolean((state as { recording?: boolean })?.recording));
  });

  window.electronAPI?.onExperimentalSettings((settings) => applyExperimentalSettings(settings));
  void window.electronAPI
    ?.getExperimentalSettings?.()
    .then((result) => applyExperimentalSettings(result?.settings))
    .catch(() => undefined);
  document.getElementById('settings-experimental-collab')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const result = await window.electronAPI?.saveExperimentalSettings({ collab: input.checked });
    if (result?.ok) {
      applyExperimentalSettings(result.settings);
    } else {
      input.checked = !input.checked;
    }
  });
  window.electronAPI?.onCollaborationUpdated(() => void refreshCollaborationCount());
  void refreshCollaborationCount();

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
}
