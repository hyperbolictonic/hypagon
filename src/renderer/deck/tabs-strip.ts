/**
 * The tab strip above the browsing view: one pill per tab, a close button and NEW TAB.
 *
 * Why a module: `renderTabs` is the only writer of the strip and the keys are per-tab, so it
 * lives away from the HUD feeds it sits next to.
 */
import type { TabSummary } from '../../shared/types.js';

const tabList = document.getElementById('tab-list') as HTMLElement;
const newTabBtn = document.getElementById('new-tab-btn') as HTMLButtonElement;

/** When to use: `getTabs`, `onTabsUpdated` and a state broadcast. */
export function renderTabs(tabs: TabSummary[]): void {
  if (!tabList) return;
  tabList.innerHTML = '';

  tabs.forEach((tab) => {
    const pill = document.createElement('div');
    const isActive = tab.isActive;

    pill.className = `group flex items-center gap-1.5 px-3 py-1 rounded-t-md border-t border-x text-xs font-mono transition-all cursor-pointer select-none max-w-[200px] shrink-0 ${
      isActive
        ? 'bg-base-100 text-accent font-semibold border-base-100 shadow-sm'
        : 'bg-base-300/60 text-base-content/60 hover:bg-base-200 hover:text-base-content border-base-200/40'
    }`;

    // Status dot (pulsing when loading or cyan when active)
    const dot = document.createElement('span');
    dot.className = `w-1.5 h-1.5 rounded-full shrink-0 ${
      tab.isLoading ? 'bg-warning animate-ping' : isActive ? 'bg-accent' : 'bg-base-content/30'
    }`;

    // Title label
    const titleSpan = document.createElement('span');
    titleSpan.className = 'truncate text-[11px] leading-tight flex-1';
    titleSpan.textContent = tab.title || 'New Tab';

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'opacity-30 group-hover:opacity-100 hover:text-error text-[10px] ml-1 p-0.5 rounded leading-none';
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI?.closeTab(tab.id);
    });

    pill.appendChild(dot);
    pill.appendChild(titleSpan);
    pill.appendChild(closeBtn);

    pill.addEventListener('click', () => {
      if (!tab.isActive) {
        window.electronAPI?.switchTab(tab.id);
      }
    });

    tabList.appendChild(pill);
  });
}

/** When to use: the HUD boot — wire NEW TAB once. */
export function initTabs(): void {
  if (!newTabBtn) return;
  newTabBtn.addEventListener('click', () => {
    window.electronAPI?.createTab('https://news.ycombinator.com');
  });
}
