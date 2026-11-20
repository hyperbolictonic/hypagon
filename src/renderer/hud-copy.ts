/**
 * HUD helpers: the app version readout and the one-click copy buttons for the log and decisions
 * panels (selection + Ctrl+C is unreliable when a native menu or the browsing view owns focus).
 */
import { BRAND } from '../shared/brand.js';
import { aboutVersion, chassisVersionBadge } from './hud-dom';
import { currentConstructMarkdown, logsContainer } from './telemetry-feed';
import { decisionFeed } from './decision-feed';

/** When to use: paint the app version into the HUD and About dialog. */
export function renderAppVersion(version: string | undefined) {
  if (!version) return;
  if (chassisVersionBadge) chassisVersionBadge.textContent = `v${version}`;
  if (aboutVersion) aboutVersion.textContent = `v${version}`;
  document.title = `${BRAND.product} v${version}`;
}

const copyLogsBtn = document.getElementById('copy-logs-btn') as HTMLButtonElement | null;
copyLogsBtn?.addEventListener('click', async () => {
  await window.electronAPI?.copyToClipboard(logsContainer.innerText);
  copyLogsBtn.textContent = 'COPIED';
  setTimeout(() => (copyLogsBtn.textContent = 'COPY'), 1200);
});

const copyDecisionsBtn = document.getElementById('copy-decisions-btn') as HTMLButtonElement | null;
copyDecisionsBtn?.addEventListener('click', async () => {
  await window.electronAPI?.copyToClipboard(decisionFeed.innerText);
  copyDecisionsBtn.textContent = 'COPIED';
  setTimeout(() => (copyDecisionsBtn.textContent = 'COPY'), 1200);
});

// The sidebar overlay is a hidden WebContentsView, so gating this on
