/**
 * The lower panel's four tabs: TELEMETRY / CONSTRUCT / LOGS / DECISIONS.
 *
 * Why a module: the decision mirror and the HUD both switch tabs, and a module that owned
 * the switcher privately would force one of them into an import cycle.
 */
import { byId } from '../dom.js';

/** Which lower panel is on screen. */
export type DeckTab = 'telemetry' | 'construct' | 'logs' | 'decisions';

/** When to use: a tab button, a harvest, or a decision arriving. */
export function switchTab(activeTab: DeckTab): void {
  const tabBtnTelemetry = byId<HTMLButtonElement>('tab-btn-telemetry')!;
  const tabBtnConstruct = byId<HTMLButtonElement>('tab-btn-construct')!;
  const tabBtnLogs = byId<HTMLButtonElement>('tab-btn-logs')!;
  const tabBtnDecisions = byId<HTMLButtonElement>('tab-btn-decisions')!;

  const tabContentTelemetry = byId<HTMLElement>('tab-content-telemetry')!;
  const tabContentConstruct = byId<HTMLElement>('tab-content-construct')!;
  const tabContentLogs = byId<HTMLElement>('tab-content-logs')!;
  const tabContentDecisions = byId<HTMLElement>('tab-content-decisions')!;

  tabBtnTelemetry.classList.toggle('tab-active', activeTab === 'telemetry');
  tabBtnConstruct.classList.toggle('tab-active', activeTab === 'construct');
  tabBtnLogs.classList.toggle('tab-active', activeTab === 'logs');
  tabBtnDecisions.classList.toggle('tab-active', activeTab === 'decisions');

  tabContentTelemetry.classList.toggle('hidden', activeTab !== 'telemetry');
  tabContentConstruct.classList.toggle('hidden', activeTab !== 'construct');
  tabContentLogs.classList.toggle('hidden', activeTab !== 'logs');
  tabContentDecisions.classList.toggle('hidden', activeTab !== 'decisions');

  tabContentConstruct.classList.toggle('flex', activeTab === 'construct');
  tabContentLogs.classList.toggle('flex', activeTab === 'logs');
  tabContentDecisions.classList.toggle('flex', activeTab === 'decisions');
}
