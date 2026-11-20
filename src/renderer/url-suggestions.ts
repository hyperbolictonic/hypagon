/**
 * The address-bar URL suggestion popup: lexical history/bookmarks, debounced semantic recall,
 * keyboard navigation and the click-to-open list.
 *
 * Owns its element, its timers and its selection state; the entry point only calls
 * `hideUrlSuggestions` when the bar loses focus.
 */

const urlForm = document.getElementById('url-form') as HTMLFormElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;

const urlSuggestions = document.getElementById('url-suggestions') as HTMLElement | null;
let suggestionItems: Array<{ url: string; title: string; domain?: string; sources?: string[]; snippet?: string }> = [];
let suggestionActive = -1;
let suggestionSeq = 0;
let lexicalTimer: ReturnType<typeof setTimeout> | null = null;
let semanticTimer: ReturnType<typeof setTimeout> | null = null;

/** When to use: the address bar lost focus or a suggestion was chosen. */
export function hideUrlSuggestions() {
  suggestionItems = [];
  suggestionActive = -1;
  urlSuggestions?.classList.add('hidden');
  if (urlSuggestions) urlSuggestions.innerHTML = '';
  urlInput.setAttribute('aria-expanded', 'false');
  urlInput.removeAttribute('aria-activedescendant');
}

function renderUrlSuggestions(items: typeof suggestionItems) {
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

async function fetchSuggestions(query: string, semantic: boolean) {
  const seq = ++suggestionSeq;
  const items = await window.electronAPI?.suggestUrls(query, { limit: 8, semantic }).catch(() => []);
  if (seq !== suggestionSeq || document.activeElement !== urlInput) return;
  renderUrlSuggestions(Array.isArray(items) ? items : []);
}

function scheduleSuggestions() {
  if (lexicalTimer) clearTimeout(lexicalTimer);
  if (semanticTimer) clearTimeout(semanticTimer);
  const query = urlInput.value.trim();
  lexicalTimer = setTimeout(() => void fetchSuggestions(query, false), 90);
  if (query.length >= 3) {
    semanticTimer = setTimeout(() => void fetchSuggestions(query, true), 420);
  }
}

function setActiveSuggestion(index: number) {
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

function chooseSuggestion(url: string) {
  hideUrlSuggestions();
  urlInput.value = url;
  urlForm.requestSubmit();
}

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

// Browser history controls: the toolbar buttons, Alt+Left/Right and F5 all funnel into the same
// IPC the MCP navigate_history tool uses.
