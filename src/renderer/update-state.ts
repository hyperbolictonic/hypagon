/**
 * The chassis state painter: URL bar, action line, nav buttons and the HUD counters.
 *
 * Reads the shared HUD handles from `hud-dom`; the page identity is forwarded to the Cortex panel.
 */
import type { ChassisState } from '../shared/types.js';
import { syncCortexPage } from './cortex-panel';
import { navBackBtn, navForwardBtn, navReloadBtn } from './url-bar';
import { renderTabs } from './tab-bar';
import { renderZoom, setZoomPinned } from './zoom-controls';

const resumeAgentBtn = document.getElementById('resume-agent-btn') as HTMLButtonElement | null;
const takeOverBtn = document.getElementById('take-over-btn') as HTMLButtonElement | null;
import {
  activeActionText,
  agentStatusBadge,
  statInteractions,
  statTokens,
  viewportLoadingSpinner,
  viewportUrlDisplay,
} from './hud-dom';

/** When to use: the chassis pushed a new state snapshot. */
export function updateState(state: ChassisState) {
  viewportUrlDisplay.textContent = state.currentUrl;
  activeActionText.textContent = state.activeAction;
  syncCortexPage(state.currentUrl, state.pageTitle);

  // Grey out history buttons the active tab cannot honour, instead of letting a click no-op
  // (Electron's navigationHistory silently returns undefined at either end of the stack).
  if (navBackBtn) navBackBtn.disabled = state.canGoBack !== true;
  if (navForwardBtn) navForwardBtn.disabled = state.canGoForward !== true;

  if (state.isLoading) {
    viewportLoadingSpinner.classList.remove('hidden');
  } else {
    viewportLoadingSpinner.classList.add('hidden');
  }

  // Update Agent Status Badge
  agentStatusBadge.textContent = state.agentStatus;
  agentStatusBadge.className = 'badge badge-sm font-mono tracking-tight';
  switch (state.agentStatus) {
    case 'IDLE':
      agentStatusBadge.classList.add('badge-accent');
      break;
    case 'TRAVERSING':
      agentStatusBadge.classList.add('badge-primary');
      break;
    case 'SIMULATING_INPUT':
      agentStatusBadge.classList.add('badge-secondary');
      break;
    case 'HARVESTING':
      agentStatusBadge.classList.add('badge-info');
      break;
    case 'ERROR':
      agentStatusBadge.classList.add('badge-error');
      break;
    case 'AWAITING_INPUT':
      agentStatusBadge.classList.add('badge-warning', 'animate-pulse');
      break;
    case 'HUMAN_INPUT':
      agentStatusBadge.classList.add('badge-info', 'animate-pulse');
      break;
  }

  if (resumeAgentBtn) {
    resumeAgentBtn.classList.toggle('hidden', state.agentStatus !== 'HUMAN_INPUT');
  }
  if (takeOverBtn) {
    takeOverBtn.classList.toggle('hidden', state.agentStatus === 'HUMAN_INPUT' || state.agentStatus === 'AWAITING_INPUT');
  }

  // Update Stats
  statTokens.textContent = `${state.stats.tokensHarvested.toLocaleString()} tkn`;
  statInteractions.textContent = `${state.stats.totalInteractions} interactions`;

  if (state.tabs) {
    renderTabs(state.tabs);
  }
  if (state.zoom) {
    renderZoom(state.zoom);
  }
  if (state.viewport) {
    (window as unknown as { __applyViewportState?: (viewport: ChassisState['viewport']) => void }).__applyViewportState?.(
      state.viewport,
    );
    setZoomPinned(Boolean(state.viewport.active));
  }
}
