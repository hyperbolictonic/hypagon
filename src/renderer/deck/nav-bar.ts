/**
 * The Deck's navigation bar: the URL field with its suggestion list, the history buttons, the
 * zoom controls and the version badge.
 *
 * Why a module: the URL field's suggestions (lexical history, then semantic recall) are ~100
 * lines of keyboard/ARIA work, and the zoom readout is the only writer of its buttons.
 */
import { BRAND } from '../../shared/brand.js';
import type { ZoomState } from '../../shared/zoom.js';

const urlForm = document.getElementById('url-form') as HTMLFormElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const navBackBtn = document.getElementById('nav-back-btn') as HTMLButtonElement | null;
const navForwardBtn = document.getElementById('nav-forward-btn') as HTMLButtonElement | null;
const navReloadBtn = document.getElementById('nav-reload-btn') as HTMLButtonElement | null;
const zoomOutBtn = document.getElementById('zoom-out-btn') as HTMLButtonElement | null;
const zoomInBtn = document.getElementById('zoom-in-btn') as HTMLButtonElement | null;
const zoomLevelBtn = document.getElementById('zoom-level-btn') as HTMLButtonElement | null;

let currentZoom: ZoomState | null = null;

/** True while the HUD is painting; the suggestion list owns `aria-expanded` then. */
const urlSuggestions = document.getElementById('url-suggestions') as HTMLElement | null;
let suggestionItems: Array<{ url: string; title: string; domain?: string; sources?: string[]; snippet?: string }> = [];
let suggestionActive = -1;
let suggestionSeq = 0;
let lexicalTimer: ReturnType<typeof setTimeout> | null = null;
let semanticTimer: ReturnType<typeof setTimeout> | null = null;

/** When to use: any navigation submit or a keyboard dismiss. */
export function hideUrlSuggestions(): void {
  suggestionItems = [];
  suggestionActive = -1;
  urlSuggestions?.classList.add('hidden');
  if (urlSuggestions) urlSuggestions.innerHTML = '';
  urlInput.setAttribute('aria-expanded', 'false');
  urlInput.removeAttribute('aria-activedescendant');
}

function renderUrlSuggestions(items: typeof suggestionItems): void {
  if (!urlSuggestions) return;
  suggestionItems = items;
  suggestionActive = -1;
  urlSuggestions.innerHTML = '';
  if (!items.length) {
    hideUrlSuggestions();
    return;
  }
  items.forEach((item, index) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.id = `url-suggestion-${index}`;
    row.dataset.url = item.url;
    row.className = 'w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-base-200 focus:bg-base-200 outline-none border-b border-base-100 last:border-0';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    const icon = document.createElement('span');
    icon.className = 'font-mono text-[10px] mt-0.5 text-base-content/50';
    const sources = Array.isArray(item.sources) ? item.sources : [];
    icon.textContent = sources.includes('bookmark') ? '★' : sources.includes('semantic') ? '≈' : '↺';
    const body = document.createElement('span');
    body.className = 'min-w-0 flex-1';
    const title = document.createElement('span');
    title.className = 'block text-xs text-base-content truncate';
    title.textContent = item.title || item.url;
    const url = document.createElement('span');
    url.className = 'block font-mono text-[10px] text-base-content/50 truncate';
    url.textContent = item.url;
    body.append(title, url);
    const badge = document.createElement('span');
    badge.className = 'badge badge-xs font-mono';
    badge.textContent = sources.includes('bookmark') ? 'saved' : sources.includes('semantic') ? 'semantic' : 'history';
    row.append(icon, body, badge);
    row.addEventListener('mousedown', (event) => event.preventDefault());
    row.addEventListener('click', () => chooseSuggestion(item.url));
    urlSuggestions.appendChild(row);
  });
  urlSuggestions.classList.remove('hidden');
  urlInput.setAttribute('aria-expanded', 'true');
}

async function fetchSuggestions(query: string, semantic: boolean): Promise<void> {
  const seq = ++suggestionSeq;
  const items = await window.electronAPI?.suggestUrls(query, { limit: 8, semantic }).catch(() => []);
  if (seq !== suggestionSeq || document.activeElement !== urlInput) return;
  renderUrlSuggestions(Array.isArray(items) ? items : []);
}

function scheduleSuggestions(): void {
  if (lexicalTimer) clearTimeout(lexicalTimer);
  if (semanticTimer) clearTimeout(semanticTimer);
  const query = urlInput.value.trim();
  lexicalTimer = setTimeout(() => void fetchSuggestions(query, false), 90);
  if (query.length >= 3) {
    semanticTimer = setTimeout(() => void fetchSuggestions(query, true), 420);
  }
}

function setActiveSuggestion(index: number): void {
  if (!urlSuggestions || !suggestionItems.length) return;
  const rows = Array.from(urlSuggestions.querySelectorAll<HTMLElement>('[role="option"]'));
  suggestionActive = (index + suggestionItems.length) % suggestionItems.length;
  rows.forEach((row, i) => {
    const active = i === suggestionActive;
    row.classList.toggle('bg-base-200', active);
    row.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const activeRow = rows[suggestionActive];
  if (activeRow) urlInput.setAttribute('aria-activedescendant', activeRow.id);
}

function chooseSuggestion(url: string): void {
  hideUrlSuggestions();
  urlInput.value = url;
  urlForm.requestSubmit();
}

function renderAppVersion(version: string | undefined): void {
  if (!version) return;
  const chassisVersionBadge = document.getElementById('chassis-version');
  const aboutVersion = document.getElementById('about-version');
  if (chassisVersionBadge) chassisVersionBadge.textContent = `v${version}`;
  if (aboutVersion) aboutVersion.textContent = `v${version}`;
  document.title = `${BRAND.product} v${version}`;
}

/** When to use: a state or zoom broadcast — the zoom button readout. */
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

async function applyZoomAction(action: 'in' | 'out' | 'reset'): Promise<void> {
  try {
    renderZoom(await window.electronAPI?.setZoom?.({ action }));
  } catch {
    // A render surface can race a window reload; the next state broadcast wins.
  }
}

/** When to use: a responsive device became active — page zoom is pinned to 100%. */
export function setZoomPinned(pinned: boolean): void {
  for (const control of [zoomOutBtn, zoomInBtn, zoomLevelBtn]) {
    if (!control) continue;
    control.disabled = pinned;
    if (pinned) control.title = 'Page zoom is pinned to 100% while a responsive device is active';
  }
  if (!pinned) renderZoom(currentZoom);
}

/** When to use: `updateState` — grey out the history buttons the tab cannot honour. */
export function setHistoryEnabled(canGoBack: boolean, canGoForward: boolean): void {
  if (navBackBtn) navBackBtn.disabled = canGoBack !== true;
  if (navForwardBtn) navForwardBtn.disabled = canGoForward !== true;
}

function wireUrlBar(): void {
  urlForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideUrlSuggestions();
    const url = urlInput.value.trim();
    if (!url) return;
    if (window.electronAPI) {
      await window.electronAPI.navigate(url);
    }
  });

  urlInput.addEventListener('input', scheduleSuggestions);
  urlInput.addEventListener('focus', scheduleSuggestions);
  urlInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (!urlSuggestions?.matches(':hover')) hideUrlSuggestions();
    }, 120);
  });
  urlInput.addEventListener('keydown', (event) => {
    if (urlSuggestions?.classList.contains('hidden')) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestion(suggestionActive + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestion(suggestionActive - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      hideUrlSuggestions();
    } else if (event.key === 'Enter' && suggestionActive >= 0) {
      event.preventDefault();
      const item = suggestionItems[suggestionActive];
      if (item) chooseSuggestion(item.url);
    }
  });
}

/** When to use: the HUD boot — wire the URL bar, the history buttons, zoom and version. */
export function initNavBar(): void {
  wireUrlBar();

  navBackBtn?.addEventListener('click', () => {
    void window.electronAPI?.goBack();
  });
  navForwardBtn?.addEventListener('click', () => {
    void window.electronAPI?.goForward();
  });
  navReloadBtn?.addEventListener('click', () => {
    void window.electronAPI?.reload();
  });

  zoomOutBtn?.addEventListener('click', () => void applyZoomAction('out'));
  zoomInBtn?.addEventListener('click', () => void applyZoomAction('in'));
  zoomLevelBtn?.addEventListener('click', () => void applyZoomAction('reset'));

  void window.electronAPI
    ?.getConnectInfo?.()
    .then((info) => renderAppVersion(info?.version))
    .catch(() => undefined);
}
