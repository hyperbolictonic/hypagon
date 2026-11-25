/**
 * Tab operations surface.
 *
 * Owns the agent-facing tab verbs: open (with the late-consent sweep), switch,
 * close and the DevTools toggle. The chassis supplies the manager, the directive
 * log, the JEV purge, the viewport refresh and the active tab.
 */
import type { WebContents } from 'electron';
import type { TabSummary } from '../../shared/types.js';
import type { TabManager } from './tab-manager.js';

/** Dependencies the tab surface needs from the chassis. */
export interface TabSurfaceDeps {
  manager(): TabManager;
  activeWebContents(): WebContents;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  purgeJev(): void;
  /** Arm the late-consent sweep for a tab that opens directly at a URL. */
  scheduleConsentSweep(): void;
  /** Re-apply the emulated frame after a tab switch. */
  refreshViewport(): void;
}

/** The tab verbs behind the MCP tools, routes and renderer IPC. */
export class TabSurface {
  constructor(private readonly deps: TabSurfaceDeps) {}

  create(url?: string): TabSummary {
    this.deps.purgeJev();
    const tab = this.deps.manager().createTab(url);
    this.deps.log('action', `MCP Directive: new_tab(${url || 'about:blank'})`);
    // A tab opened directly at a URL is a navigation too: arm the same late-consent sweep, or a
    // cookie wall on a freshly opened tab would never be dismissed.
    if (url && /^https?:/i.test(url)) this.deps.scheduleConsentSweep();
    return {
      id: tab.id,
      title: tab.title,
      url: tab.url,
      isLoading: tab.isLoading,
      isActive: true,
    };
  }

  switchTo(tabId: string): void {
    const manager = this.deps.manager();
    this.deps.log('action', `MCP Directive: switch_tab(${tabId})`);
    this.deps.purgeJev();
    manager.switchTab(tabId);
    this.deps.refreshViewport();
  }

  close(tabId?: string): void {
    const manager = this.deps.manager();
    this.deps.log('action', `MCP Directive: close_tab(${tabId || 'active'})`);
    this.deps.purgeJev();
    manager.closeTab(tabId);
  }

  /** Open or close the native Chromium DevTools for the active tab. */
  toggleDevTools(): boolean {
    try {
      const wc = this.deps.activeWebContents();
      if (wc.isDevToolsOpened()) {
        wc.closeDevTools();
        return false;
      }
      wc.openDevTools({ mode: 'detach' });
      return true;
    } catch {
      return false;
    }
  }
}
