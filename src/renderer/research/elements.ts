/**
 * Every node the research surface touches, resolved once.
 *
 * Why a module: the panel kept 27 `byId` lookups inline and then had to null-check each
 * one at its use site. Resolving them in one place means the wiring code can treat the
 * required four as present (the module returns null otherwise) and the optional ones as
 * `| null` once.
 */
import { byId } from '../dom.js';

/** When to use: `initResearchPanel` — the panel's DOM. */
export interface ResearchElements {
  view: HTMLElement;
  launcher: HTMLButtonElement | null;
  launcherDot: HTMLElement | null;
  launcherBadge: HTMLElement | null;
  closeButton: HTMLButtonElement | null;
  runButton: HTMLButtonElement;
  queryInput: HTMLInputElement | null;
  engineSelect: HTMLSelectElement | null;
  status: HTMLElement | null;
  elapsed: HTMLElement | null;
  escalations: HTMLElement | null;
  rows: HTMLElement;
  empty: HTMLElement | null;
  log: HTMLElement;
  logCount: HTMLElement | null;
  statSources: HTMLElement | null;
  statIndexed: HTMLElement | null;
  statBytes: HTMLElement | null;
  tierLlm: HTMLElement | null;
  tierStatic: HTMLElement | null;
  tierRender: HTMLElement | null;
  statHumans: HTMLElement | null;
  statAnchors: HTMLElement | null;
  fontDec: HTMLButtonElement | null;
  fontInc: HTMLButtonElement | null;
  fontLabel: HTMLElement | null;
  revalidate: HTMLButtonElement | null;
}

/**
 * When to use: `initResearchPanel` first — null means the surface is not in this page
 * (the view, the run button, the table body and the log are the four it cannot work without).
 */
export function collectResearchElements(): ResearchElements | null {
  const view = byId<HTMLElement>('research-view');
  const runButton = byId<HTMLButtonElement>('research-run');
  const rows = byId<HTMLElement>('research-rows');
  const log = byId<HTMLElement>('research-log');
  if (!view || !runButton || !rows || !log) return null;

  return {
    view,
    runButton,
    rows,
    log,
    launcher: byId<HTMLButtonElement>('research-tab-btn'),
    launcherDot: byId<HTMLElement>('research-tab-dot'),
    launcherBadge: byId<HTMLElement>('research-tab-badge'),
    closeButton: byId<HTMLButtonElement>('research-close'),
    queryInput: byId<HTMLInputElement>('research-query'),
    engineSelect: byId<HTMLSelectElement>('research-engine'),
    status: byId<HTMLElement>('research-status'),
    elapsed: byId<HTMLElement>('research-elapsed'),
    escalations: byId<HTMLElement>('research-escalations'),
    empty: byId<HTMLElement>('research-empty'),
    logCount: byId<HTMLElement>('research-log-count'),
    statSources: byId<HTMLElement>('research-stat-sources'),
    statIndexed: byId<HTMLElement>('research-stat-indexed'),
    statBytes: byId<HTMLElement>('research-stat-bytes'),
    tierLlm: byId<HTMLElement>('research-tier-llm'),
    tierStatic: byId<HTMLElement>('research-tier-static'),
    tierRender: byId<HTMLElement>('research-tier-render'),
    statHumans: byId<HTMLElement>('research-stat-humans'),
    statAnchors: byId<HTMLElement>('research-stat-anchors'),
    fontDec: byId<HTMLButtonElement>('research-font-dec'),
    fontInc: byId<HTMLButtonElement>('research-font-inc'),
    fontLabel: byId<HTMLElement>('research-font-label'),
    revalidate: byId<HTMLButtonElement>('research-revalidate'),
  };
}
