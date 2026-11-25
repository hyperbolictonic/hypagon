/**
 * Cortex recall and bookmarks modal.
 *
 * Owns the history list, vector/FTS recall results, the bookmark star and the
 * bookmark form. The active page is tracked here so the address-bar star and
 * the save form agree without main.ts holding UI state.
 */
import type { ElectronAPI } from '../preload/index.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

/** Callbacks the panel needs from the app shell. */
export interface CortexDeps {
  appendLog(log: { id: string; time: string; level: 'info'; message: string }): void;
}

let deps: CortexDeps | null = null;
let initialized = false;

// Cortex Modal & Bookmark Management
const cortexBtn = document.getElementById('cortex-btn') as HTMLButtonElement | null;
const cortexModal = document.getElementById('cortex-modal') as HTMLDialogElement | null;
const bookmarkToggleBtn = document.getElementById('bookmark-toggle-btn') as HTMLButtonElement | null;
const bookmarkStarIcon = document.getElementById('bookmark-star-icon') as SVGElement | null;

const tabCortexRecall = document.getElementById('tab-cortex-recall') as HTMLButtonElement | null;
const tabCortexBookmarks = document.getElementById('tab-cortex-bookmarks') as HTMLButtonElement | null;
const panelCortexRecall = document.getElementById('panel-cortex-recall') as HTMLElement | null;
const panelCortexBookmarks = document.getElementById('panel-cortex-bookmarks') as HTMLElement | null;

const cortexSearchInput = document.getElementById('cortex-search-input') as HTMLInputElement | null;
const cortexSearchBtn = document.getElementById('cortex-search-btn') as HTMLButtonElement | null;
const cortexClearHistoryBtn = document.getElementById('cortex-clear-history-btn') as HTMLButtonElement | null;
const cortexResultsContainer = document.getElementById('cortex-results-container') as HTMLElement | null;

const bkmkInputUrl = document.getElementById('bkmk-input-url') as HTMLInputElement | null;
const bkmkInputTitle = document.getElementById('bkmk-input-title') as HTMLInputElement | null;
const bkmkInputNotes = document.getElementById('bkmk-input-notes') as HTMLInputElement | null;
const bkmkInputTags = document.getElementById('bkmk-input-tags') as HTMLInputElement | null;
const bkmkSaveBtn = document.getElementById('bkmk-save-btn') as HTMLButtonElement | null;
const cortexBookmarksContainer = document.getElementById('cortex-bookmarks-container') as HTMLElement | null;

let activeUrl = 'about:blank';
let activeTitle = '';
let bookmarkCheckSeq = 0;

// Check bookmark state for current page
async function checkCurrentBookmarkState(url: string) {
  const seq = ++bookmarkCheckSeq;
  const paint = (saved: boolean) => {
    if (seq !== bookmarkCheckSeq || !bookmarkStarIcon) return;
    bookmarkStarIcon.setAttribute('fill', saved ? 'currentColor' : 'none');
    bookmarkStarIcon.setAttribute('class', saved ? 'w-4 h-4 text-warning' : 'w-4 h-4 text-base-content/60');
    bookmarkToggleBtn?.setAttribute('aria-pressed', saved ? 'true' : 'false');
    if (bookmarkToggleBtn) bookmarkToggleBtn.title = saved ? 'Remove bookmark' : 'Bookmark this page';
  };
  if (!api || !bookmarkStarIcon || !url || url === 'about:blank') {
    paint(false);
    return;
  }
  try {
    const isSaved = await api.isBookmarked(url);
    if (seq !== bookmarkCheckSeq) return;
    paint(isSaved);
  } catch {
    // Ignore error; keep the default star.
  }
}

// Load and render history list
async function loadHistoryList() {
  if (!api || !cortexResultsContainer) return;
  try {
    const history = await api.getHistory({ limit: 15 });
    if (!history || history.length === 0) {
      cortexResultsContainer.innerHTML = `
        <div class="text-center py-8 text-xs font-mono text-base-content/50">
          No browsing history recorded yet. Browse the web to populate LanceDB.
        </div>`;
      return;
    }

    cortexResultsContainer.innerHTML = '';
    history.forEach((item: any) => {
      const card = document.createElement('div');
      card.className = 'bg-base-100 p-3 rounded-lg border border-base-200 hover:border-secondary/50 transition-colors flex items-center justify-between gap-3';
      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge badge-neutral badge-xs font-mono">${item.domain}</span>
            <span class="text-[10px] font-mono text-base-content/40">${new Date(item.visitedAt).toLocaleTimeString()}</span>
          </div>
          <div class="font-mono text-xs font-bold text-base-content truncate">${item.title || item.url}</div>
          <div class="text-[11px] font-mono text-base-content/60 truncate">${item.url}</div>
        </div>
        <button class="btn btn-xs btn-outline btn-secondary font-mono flex-shrink-0 launch-btn">
          ENGAGE
        </button>
      `;
      card.querySelector('.launch-btn')?.addEventListener('click', () => {
        cortexModal?.close();
        api?.navigate(item.url);
      });
      cortexResultsContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

// Perform Recall Search
async function performRecall() {
  const query = cortexSearchInput?.value.trim();
  if (!query) {
    loadHistoryList();
    return;
  }
  if (!api || !cortexResultsContainer) return;

  cortexResultsContainer.innerHTML = `
    <div class="text-center py-8 font-mono text-xs text-secondary flex items-center justify-center gap-2">
      <span class="loading loading-spinner loading-xs"></span>
      Querying LanceDB Cortex Vector & FTS Index...
    </div>`;

  try {
    const results = await api.recallMemory(query, { limit: 8 });
    if (!results || results.length === 0) {
      cortexResultsContainer.innerHTML = `
        <div class="text-center py-8 text-xs font-mono text-base-content/50">
          No matching memory traces found for: "${query}"
        </div>`;
      return;
    }

    cortexResultsContainer.innerHTML = '';
    results.forEach((res: any) => {
      const card = document.createElement('div');
      card.className = 'bg-base-100 p-3 rounded-lg border border-base-200 hover:border-secondary/60 transition-colors space-y-2';
      const scorePercent = res.score ? Math.round(res.score * 100) : 85;

      card.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="badge badge-secondary badge-xs font-mono">${res.domain}</span>
            <span class="badge badge-neutral badge-xs font-mono">${scorePercent}% MATCH</span>
            <div class="font-mono text-xs font-bold text-base-content truncate">${res.title}</div>
          </div>
          <button class="btn btn-xs btn-primary font-mono flex-shrink-0 launch-btn">ENGAGE</button>
        </div>
        <div class="bg-base-200/60 p-2 rounded text-[11px] font-mono text-base-content/80 line-clamp-3 leading-relaxed whitespace-pre-wrap">
          ${res.snippet}
        </div>
        <div class="text-[10px] font-mono text-base-content/40 truncate">${res.url}</div>
      `;
      card.querySelector('.launch-btn')?.addEventListener('click', () => {
        cortexModal?.close();
        api?.navigate(res.url);
      });
      cortexResultsContainer.appendChild(card);
    });
  } catch (err) {
    cortexResultsContainer.innerHTML = `<div class="alert alert-error text-xs font-mono">Recall failed: ${err}</div>`;
  }
}

// Load and render bookmarks list
async function loadBookmarksList() {
  if (!api || !cortexBookmarksContainer) return;
  try {
    const bookmarks = await api.listBookmarks();
    if (!bookmarks || bookmarks.length === 0) {
      cortexBookmarksContainer.innerHTML = `
        <div class="text-center py-8 text-xs font-mono text-base-content/50">
          No saved bookmarks yet. Save a bookmark using the form above or the address bar star.
        </div>`;
      return;
    }

    cortexBookmarksContainer.innerHTML = '';
    bookmarks.forEach((b: any) => {
      const card = document.createElement('div');
      card.className = 'bg-base-100 p-3 rounded-lg border border-base-200 hover:border-warning/50 transition-colors flex items-center justify-between gap-3';
      const tagsHtml = (b.tags || []).map((t: string) => `<span class="badge badge-warning badge-xs font-mono">#${t}</span>`).join(' ');

      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 mb-1 flex-wrap">
            <span class="text-warning text-xs">⭐</span>
            <div class="font-mono text-xs font-bold text-base-content truncate">${b.title}</div>
            ${tagsHtml}
          </div>
          ${b.notes ? `<div class="text-[11px] font-mono text-base-content/70 italic mb-1 truncate">${b.notes}</div>` : ''}
          <div class="text-[10px] font-mono text-base-content/40 truncate">${b.url}</div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <button class="btn btn-xs btn-outline btn-warning font-mono launch-btn">ENGAGE</button>
          <button class="btn btn-xs btn-ghost btn-square text-error hover:bg-error/10 delete-btn" title="Delete bookmark">✕</button>
        </div>
      `;
      card.querySelector('.launch-btn')?.addEventListener('click', () => {
        cortexModal?.close();
        api?.navigate(b.url);
      });
      card.querySelector('.delete-btn')?.addEventListener('click', async () => {
        await api?.deleteBookmark(b.id || b.url);
        loadBookmarksList();
        checkCurrentBookmarkState(activeUrl);
      });
      cortexBookmarksContainer.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to load bookmarks:', err);
  }
}

/** The address-bar star and the save form both write bookmarks. */
function bindBookmarkControls(): void {
  if (bookmarkToggleBtn) {
    bookmarkToggleBtn.addEventListener('click', async () => {
      if (!api || !activeUrl || activeUrl === 'about:blank') return;
      const isSaved = await api.isBookmarked(activeUrl);
      if (isSaved) {
        await api.deleteBookmark(activeUrl);
        deps?.appendLog({ id: String(Date.now()), time: new Date().toLocaleTimeString(), level: 'info', message: `Bookmark removed: ${activeUrl}` });
      } else {
        await api.addBookmark({ url: activeUrl, title: activeTitle });
        deps?.appendLog({ id: String(Date.now()), time: new Date().toLocaleTimeString(), level: 'info', message: `Page bookmarked: ${activeTitle || activeUrl}` });
      }
      checkCurrentBookmarkState(activeUrl);
    });
  }

  if (bkmkSaveBtn) {
    bkmkSaveBtn.addEventListener('click', async () => {
      const url = bkmkInputUrl?.value.trim() || activeUrl;
      if (!url || url === 'about:blank') return;
      const title = bkmkInputTitle?.value.trim() || activeTitle;
      const notes = bkmkInputNotes?.value.trim() || '';
      const tags = bkmkInputTags?.value.split(',').map(s => s.trim()).filter(Boolean) || [];

      await api?.addBookmark({ url, title, notes, tags });
      if (bkmkInputNotes) bkmkInputNotes.value = '';
      if (bkmkInputTags) bkmkInputTags.value = '';
      loadBookmarksList();
      checkCurrentBookmarkState(activeUrl);
    });
  }
}

/** The modal frame, its viewport hand-off, and the recall/bookmarks tabs. */
function bindCortexModal(): void {
  if (!cortexBtn || !cortexModal) return;
  cortexBtn.addEventListener('click', () => {
    api?.setViewportVisibility(false);
    if (bkmkInputUrl) bkmkInputUrl.value = activeUrl !== 'about:blank' ? activeUrl : '';
    if (bkmkInputTitle) bkmkInputTitle.value = activeTitle;
    loadHistoryList();
    cortexModal.showModal();
  });

  cortexModal.addEventListener('close', () => {
    api?.setViewportVisibility(true);
    checkCurrentBookmarkState(activeUrl);
  });

  if (!tabCortexRecall || !tabCortexBookmarks || !panelCortexRecall || !panelCortexBookmarks) return;
  tabCortexRecall.addEventListener('click', () => {
    tabCortexRecall.classList.add('tab-active');
    tabCortexBookmarks.classList.remove('tab-active');
    panelCortexRecall.classList.remove('hidden');
    panelCortexBookmarks.classList.add('hidden');
    loadHistoryList();
  });

  tabCortexBookmarks.addEventListener('click', () => {
    tabCortexBookmarks.classList.add('tab-active');
    tabCortexRecall.classList.remove('tab-active');
    panelCortexBookmarks.classList.remove('hidden');
    panelCortexRecall.classList.add('hidden');
    loadBookmarksList();
  });
}

/** Recall search and the clear-history action. */
function bindRecallControls(): void {
  if (cortexSearchBtn) {
    cortexSearchBtn.addEventListener('click', performRecall);
  }
  if (cortexSearchInput) {
    cortexSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') performRecall();
    });
  }
  if (cortexClearHistoryBtn) {
    cortexClearHistoryBtn.addEventListener('click', async () => {
      if (confirm('Clear all browsing history and indexed page chunks from LanceDB?')) {
        await api?.clearHistory('all');
        loadHistoryList();
      }
    });
  }
}

/** Wire the modal once, after the document has parsed. */
export function initCortexPanel(next: CortexDeps): void {
  deps = next;
  if (initialized) return;
  initialized = true;
  bindBookmarkControls();
  bindCortexModal();
  bindRecallControls();
}

/** Track the active page for the bookmark star and the save form. */
export function updateActivePage(url: string, title: string): void {
  activeUrl = url;
  activeTitle = title;
  void checkCurrentBookmarkState(url);
}
