/**
 * Live page identity for the active tab.
 *
 * The cached state can lag behind SPAs that navigate with pushState (no
 * did-navigate event), so the live document is read first and the tab's cached
 * URL/title are brought back in step.
 */
import type { ChassisState } from '../../shared/types.js';
import type { TabInstance } from './tab-manager.js';

/** The page identity the primitives, JEV and HUD read. */
export interface PageInfo {
  url: string;
  title: string;
  isLoading: boolean;
  activeTabId?: string;
}

/** When to use: reading the active page — prefers the live document over cached state. */
export function readPageInfo(
  state: Pick<ChassisState, 'currentUrl' | 'pageTitle' | 'isLoading' | 'activeTabId'>,
  activeTab: TabInstance | null,
): PageInfo {
  let url = state.currentUrl;
  let title = state.pageTitle;
  try {
    const live = activeTab?.view?.webContents;
    if (live && !live.isDestroyed()) {
      const liveUrl = live.getURL();
      const liveTitle = live.getTitle();
      if (liveUrl) url = liveUrl;
      if (liveTitle) title = liveTitle;
      // Keep the tab bar's cached values in step with what the page actually is.
      if (activeTab.url !== url) activeTab.url = url;
      if (activeTab.title !== title) activeTab.title = title;
    }
  } catch {
    // No active tab yet — fall back to the cached state.
  }
  return {
    url,
    title,
    isLoading: state.isLoading,
    activeTabId: state.activeTabId,
  };
}
