/**
 * The research buttons: the tab-bar launcher, close, RUN and "check saved citations".
 *
 * Why a module: each has its own enable/disable rule and error path, and none of them is
 * an event from the main process. Keeping them here leaves the panel as wiring, and the
 * event handlers as rendering.
 */
import type { ElectronAPI } from '../../preload/index.js';
import { beginRun, stopTicker, type ResearchContext } from './handlers.js';

/**
 * When to use: `initResearchPanel` — wire the four controls once.
 *
 * RUN validates the query, takes the screen, clears the surface and hands the query to the
 * main process; a failure is reported in the same terminal the run uses.
 */
export function wireResearchControls(ctx: ResearchContext, api: ElectronAPI | undefined): void {
  const { elements, chrome, log } = ctx;

  elements.launcher?.addEventListener('click', () => {
    void chrome.toggle();
  });

  elements.closeButton?.addEventListener('click', () => {
    void chrome.hide();
  });

  elements.revalidate?.addEventListener('click', async () => {
    const button = elements.revalidate!;
    button.disabled = true;
    const label = button.textContent;
    button.textContent = 'CHECKING…';
    try {
      const result = await api?.revalidateCitations({ maxUrls: 5 });
      if (!result || result.checked === 0) {
        log.write('saved citations · none to check', 'text-warning');
      } else {
        log.write(
          `saved citations · ${result.checked} checked · ${result.found} found · ${result.missing} missing`,
          result.missing > 0 ? 'text-warning' : 'text-success',
        );
      }
    } catch (err) {
      log.write(`saved citation check failed · ${(err as Error).message}`, 'text-error');
    } finally {
      button.disabled = false;
      button.textContent = label || 'CHECK SAVED';
    }
  });

  elements.runButton.addEventListener('click', async () => {
    const query = (elements.queryInput?.value ?? '').trim();
    if (!query) {
      log.write('enter a query first', 'text-warning');
      return;
    }

    await chrome.show();
    const button = elements.runButton;
    button.disabled = true;
    beginRun(ctx);
    try {
      await api?.researchRun({
        query,
        engine: elements.engineSelect?.value || undefined,
        maxSources: 5,
      });
    } catch (error) {
      log.write(`error · ${(error as Error).message}`, 'text-error');
      if (elements.status) elements.status.textContent = 'error';
      chrome.setState('error');
      stopTicker(ctx);
    } finally {
      button.disabled = false;
    }
  });
}
