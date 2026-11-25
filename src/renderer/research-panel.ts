/**
 * Research workspace.
 *
 * Research is a full-bleed surface, not a sidebar widget: opening it hides the browser view and
 * collapses the sidebar automatically, then restores both on close. The tab-bar launcher stays
 * pinned and reflects run state (running / done / escalated / error).
 *
 * Layout is deliberately dense: a source table (tier, size, time, highlights, status), a stats
 * strip (sources / indexed / data / tier mix) and a terminal log — everything visible at a glance.
 *
 * The same events the agent receives are rendered here, so a tier escalation is visible to both.
 * `human-needed` rows are the future HIL hand-off point (OPEN navigates the active tab for now).
 *
 * Why this file is small: `research/elements.ts` resolves the DOM once,
 * `research/chrome.ts` owns the open/close mode change and the launcher,
 * `research/log-view.ts` the terminal, `research/stats.ts` the strip,
 * `research/rows.ts` the source table, `research/handlers.ts` the nine event types and
 * `research/controls.ts` the buttons. This module only wires them.
 */
import type { ElectronAPI } from '../preload/index.js';
import { ResearchChrome, wireFontScale } from './research/chrome.js';
import { wireResearchControls } from './research/controls.js';
import { collectResearchElements } from './research/elements.js';
import { applyResearchEvent, type ResearchContext } from './research/handlers.js';
import { ResearchLog } from './research/log-view.js';
import { SourceRows } from './research/rows.js';
import { ResearchStats } from './research/stats.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

export function initResearchPanel(): void {
  const elements = collectResearchElements();
  if (!elements) return;

  wireFontScale(elements);

  const ctx: ResearchContext = {
    elements,
    chrome: new ResearchChrome({ elements, api }),
    log: new ResearchLog({ log: elements.log, logCount: elements.logCount }),
    stats: new ResearchStats(elements),
    rows: new SourceRows({ container: elements.rows, empty: elements.empty, api }),
    escalations: { count: 0 },
    ticker: { id: undefined },
  };

  api?.onResearchEvent?.((event) => applyResearchEvent(ctx, event));
  wireResearchControls(ctx, api);

  ctx.stats.render();
  ctx.chrome.setState('idle');
}
