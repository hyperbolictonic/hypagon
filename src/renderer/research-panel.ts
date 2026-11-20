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
 * Run state lives in `research-controller.ts` and the DOM helpers in `research-dom.ts`; this
 * module only collects the elements and wires the controls.
 */
import type { ElectronAPI } from '../preload/index.js';
import { collectResearchDom } from './research-dom.js';
import { ResearchController } from './research-controller.js';

const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;

/** When to use: wiring the research panel once the deck document loads. */
export function initResearchPanel(): void {
  const dom = collectResearchDom();
  if (!dom) return;
  const controller = new ResearchController(dom, api);

  // Readability control: zoom the whole dashboard (table, terminal, stats) and remember it.
  let fontScale = Number(localStorage.getItem('research.fontScale') ?? '1');
  if (!Number.isFinite(fontScale)) fontScale = 1;
  const applyFontScale = (): void => {
    dom.view.style.setProperty('zoom', String(fontScale));
    if (dom.fontLabel) dom.fontLabel.textContent = `${Math.round(fontScale * 100)}%`;
    try {
      localStorage.setItem('research.fontScale', String(fontScale));
    } catch {
      /* storage unavailable */
    }
  };
  dom.fontDec?.addEventListener('click', () => {
    fontScale = Math.max(0.8, Math.round((fontScale - 0.1) * 100) / 100);
    applyFontScale();
  });
  dom.fontInc?.addEventListener('click', () => {
    fontScale = Math.min(1.8, Math.round((fontScale + 0.1) * 100) / 100);
    applyFontScale();
  });
  applyFontScale();

  api?.onResearchEvent?.((event) => controller.applyEvent(event));

  dom.launcher?.addEventListener('click', () => {
    void controller.toggle();
  });

  dom.revalidateBtn?.addEventListener('click', async () => {
    dom.revalidateBtn!.disabled = true;
    const label = dom.revalidateBtn!.textContent;
    dom.revalidateBtn!.textContent = 'CHECKING…';
    try {
      const result = await api?.revalidateCitations({ maxUrls: 5 });
      if (!result || result.checked === 0) {
        controller.log('saved citations · none to check', 'text-warning');
      } else {
        controller.log(
          `saved citations · ${result.checked} checked · ${result.found} found · ${result.missing} missing`,
          result.missing > 0 ? 'text-warning' : 'text-success',
        );
      }
    } catch (err) {
      controller.log(`saved citation check failed · ${(err as Error).message}`, 'text-error');
    } finally {
      dom.revalidateBtn!.disabled = false;
      dom.revalidateBtn!.textContent = label || 'CHECK SAVED';
    }
  });

  dom.closeButton?.addEventListener('click', () => {
    void controller.closeView();
  });

  dom.runButton.addEventListener('click', async () => {
    const query = (dom.queryInput?.value ?? '').trim();
    if (!query) {
      controller.log('enter a query first', 'text-warning');
      return;
    }

    await controller.openView();
    dom.runButton.disabled = true;
    controller.reset();
    try {
      await api?.researchRun({
        query,
        engine: dom.engineSelect?.value || undefined,
        maxSources: 5,
      });
    } catch (error) {
      controller.log(`error · ${(error as Error).message}`, 'text-error');
      if (dom.statusEl) dom.statusEl.textContent = 'error';
      controller.setLauncherState('error');
      controller.stopTicker();
    } finally {
      dom.runButton.disabled = false;
    }
  });

  controller.renderStats();
  controller.setLauncherState('idle');
}
