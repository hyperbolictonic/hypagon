/**
 * The open tabs and which one is active.
 *
 * Why a module: the map, the active id and the summary projection are read by the
 * chassis, the IPC surface and the tab strip, and written only by the manager's
 * create/switch/close. Keeping the collection here means the manager's methods are
 * about lifecycle, not bookkeeping.
 */
import type { TabSummary } from '../../shared/types.js';
import type { TabInstance } from './tab-types.js';

/** When to use: `TabManager` — one registry per window. */
export class TabRegistry {
  /** Every open tab, in creation order. */
  readonly tabs = new Map<string, TabInstance>();
  /** The active tab's id (empty before the first tab exists). */
  activeId = '';

  /** The active tab; throws when there is none (the app always has one). */
  active(): TabInstance {
    const tab = this.tabs.get(this.activeId);
    if (!tab) throw new Error('No active tab available in Cyberdeck');
    return tab;
  }

  /** A tab by id, or undefined. */
  get(tabId: string): TabInstance | undefined {
    return this.tabs.get(tabId);
  }

  /** The active tab when it still exists; undefined before the first tab or mid-teardown. */
  activeOrUndefined(): TabInstance | undefined {
    return this.activeId ? this.tabs.get(this.activeId) : undefined;
  }

  /** All open tabs (a copy, so callers cannot mutate the registry). */
  all(): TabInstance[] {
    return [...this.tabs.values()];
  }

  /** The tab strip's view of the registry. */
  summary(): TabSummary[] {
    return Array.from(this.tabs.values()).map((tab) => ({
      id: tab.id,
      title: tab.title || 'New Tab',
      url: tab.url || 'about:blank',
      isLoading: tab.isLoading,
      isActive: tab.id === this.activeId,
    }));
  }
}
