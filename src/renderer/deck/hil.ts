/**
 * The human-in-the-loop surfaces: the toolbar toast (manual takeover) and the HUD banner
 * ("DONE" after a drive/decide hand-off).
 *
 * Why a module: both exist only while a human owns the browser, both dismiss on the same
 * cleared event, and both light the orb — so they belong together, away from the HUD feeds.
 */
import { markHilActive } from './sidebar.js';

const hilToast = document.getElementById('hil-toast');
const hilToastReason = document.getElementById('hil-toast-reason');
const hilToastResume = document.getElementById('hil-toast-resume');
const hilToastCancel = document.getElementById('hil-toast-cancel');
const hilToastReload = document.getElementById('hil-toast-reload');

/** When to use: an HIL request — a banner the human can dismiss after acting. */
function showHilBanner(req: { id: string; reason: string }): void {
  removeHilBanner();
  const banner = document.createElement('div');
  banner.id = 'hud-hil-banner';
  // Anchored to the side panel (right), not across the middle: a human is being asked to act in
  // the *browser*, so the notice must not cover the thing they need to look at.
  banner.className =
    'alert alert-warning shadow-2xl fixed bottom-10 right-3 z-50 w-[min(420px,calc(100vw-1.5rem))] flex items-center justify-between border-2 border-warning font-mono text-xs';

  // Built with textContent, never innerHTML: `reason` can quote page copy (the sensitive-gate rule
  // puts matched lines in it), and page copy is attacker-controlled.
  const wrap = document.createElement('div');
  wrap.className = 'flex items-center gap-2';
  const icon = document.createElement('span');
  icon.className = 'text-base';
  icon.textContent = '⚠️';
  const col = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'font-bold text-[10px] uppercase tracking-wider text-warning-content';
  title.textContent = 'Human Action Needed';
  const reason = document.createElement('div');
  reason.className = 'text-xs text-base-content';
  reason.textContent = req.reason;
  col.append(title, reason);
  wrap.append(icon, col);

  const btn = document.createElement('button');
  btn.id = 'hud-hil-resolve-btn';
  btn.className = 'btn btn-xs btn-success font-mono font-bold ml-4';
  btn.textContent = 'DONE';

  banner.append(wrap, btn);
  document.body.appendChild(banner);

  btn.addEventListener('click', async () => {
    btn.textContent = 'RESUMING...';
    await window.electronAPI.resolveHil(req.id, 'User clicked DONE in Command Deck HUD');
    removeHilBanner();
  });
}

/** Remove the banner if it is up. */
function removeHilBanner(): void {
  const b = document.getElementById('hud-hil-banner');
  if (b) b.remove();
}

/** When to use: the HUD boot — subscribe the HIL surfaces once. */
export function initHil(): void {
  window.electronAPI?.onHilRequested((request) => {
    markHilActive(true);
    if (hilToast && hilToastReason) {
      hilToastReason.textContent = request?.reason || 'Human intervention required';
      hilToast.classList.remove('hidden');
    }
  });
  window.electronAPI?.onHilCleared(() => {
    markHilActive(false);
    hilToast?.classList.add('hidden');
  });

  hilToastResume?.addEventListener('click', () => {
    void window.electronAPI?.resolveHil();
  });
  hilToastCancel?.addEventListener('click', () => {
    void window.electronAPI?.cancelHil();
  });
  hilToastReload?.addEventListener('click', () => {
    void window.electronAPI?.reloadHil();
  });

  window.electronAPI.onHilRequested(showHilBanner);
  window.electronAPI.onHilCleared(removeHilBanner);

  // Check if an HIL request is already active on load.
  window.electronAPI.getActiveHil().then((active) => {
    if (active) showHilBanner(active);
  });
}
