/**
 * Citation revalidation from the research panel.
 *
 * A row can carry anchors; the CHECK CITATION button asks the main process to relocate the
 * top anchor in the live page and reports the match score. A miss is shown as MISSING with
 * the best candidate, because "not found" without a near miss is not actionable.
 *
 * When to use: the button on a source row — the controller owns the row, this owns the call.
 */
import type { ElectronAPI } from '../preload/index.js';
import type { ResearchRow } from './research-dom.js';

/** When to use: `applySourceDone`'s check button. */
export async function checkCitation(
  api: ElectronAPI | undefined,
  row: ResearchRow,
  button: HTMLButtonElement,
): Promise<void> {
  const anchor = row.anchors?.[0];
  if (!anchor) return;
  button.disabled = true;
  button.textContent = 'CHECKING…';
  try {
    const result = await api?.relocateCitation({
      url: row.url,
      fingerprint: anchor.fingerprint,
    });
    if (!result) {
      button.textContent = 'NO RESULT';
      return;
    }
    if (result.found) {
      button.textContent = `${result.score}%`;
      button.className = `btn btn-xs ${result.score >= 80 ? 'btn-success' : 'btn-warning'} mt-1`;
      button.title = result.text || '';
    } else {
      const best = result.candidates?.[0] ? ` (best candidate ${result.candidates[0].score}%)` : '';
      button.textContent = 'MISSING';
      button.className = 'btn btn-xs btn-error mt-1';
      button.title = `${result.error || 'not found'}${best}`;
    }
  } catch (err) {
    button.textContent = 'FAILED';
    button.className = 'btn btn-xs btn-error mt-1';
    button.title = (err as Error).message;
  } finally {
    button.disabled = false;
  }
}
