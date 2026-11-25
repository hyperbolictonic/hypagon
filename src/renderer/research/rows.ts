/**
 * The source table: one row per source, its tier badge, its numbers and its status cell.
 *
 * Why a module: a row is created optimistically on `source-start` and filled in on
 * `source-done`, and the human-intervention rows reuse the same shape. The map, the row
 * builder and the per-row citation check belong together — and out of the event switch.
 */
import type { ElectronAPI } from '../../preload/index.js';
import type { ResearchAnchorDetail, ResearchTier } from '../../shared/research-events.js';

const TIER_BADGE: Record<ResearchTier, string> = {
  llm: 'badge-success',
  static: 'badge-info',
  render: 'badge-warning',
};

/** When to use: a row in the source table — its cells, kept for later events. */
export interface SourceRow {
  root: HTMLTableRowElement;
  url: string;
  anchors?: ResearchAnchorDetail[];
  tier: HTMLElement;
  kb: HTMLElement;
  ms: HTMLElement;
  hl: HTMLElement;
  status: HTMLElement;
}

/** When to use: `SourceRows` — the table body and the bridge for the citation check. */
export interface SourceRowsDeps {
  container: HTMLElement;
  empty: HTMLElement | null;
  api: ElectronAPI | undefined;
}

/** A table cell with a Tailwind class and optional text. */
function cell(className: string, text = ''): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = className;
  td.textContent = text;
  return td;
}

/** A div carrying a Tailwind class and optional text. */
function line(className: string, text = ''): HTMLDivElement {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  return div;
}

/** When to use: `initResearchPanel` — one table per panel. */
export class SourceRows {
  private readonly deps: SourceRowsDeps;
  private readonly rows = new Map<string, SourceRow>();

  constructor(deps: SourceRowsDeps) {
    this.deps = deps;
  }

  /** How many source rows exist (rank rows only, not the human-intervention ones). */
  count(): number {
    return [...this.rows.keys()].filter((key) => key.startsWith('s')).length;
  }

  /** A row by key, or undefined. */
  get(key: string): SourceRow | undefined {
    return this.rows.get(key);
  }

  /** Empty the table and bring the "no sources yet" hint back. */
  reset(): void {
    this.rows.clear();
    this.deps.container.replaceChildren();
    this.deps.container.closest('table')?.classList.remove('hidden');
    this.deps.empty?.classList.add('hidden');
  }

  /** The row for a key, created on first use and reused afterwards. */
  rowFor(key: string, rank: string, url: string, title: string): SourceRow {
    const existing = this.rows.get(key);
    if (existing) return existing;

    this.deps.empty?.classList.add('hidden');

    const root = document.createElement('tr');
    root.className = 'hover';

    const rankCell = cell('w-8 text-base-content/40', rank);

    const sourceCell = document.createElement('td');
    const titleEl = line('truncate max-w-[560px] text-[11px]', title || url);
    const urlEl = line('truncate max-w-[560px] text-[9px] text-base-content/40', url);
    sourceCell.append(titleEl, urlEl);

    const tierCell = cell('w-16');
    const badge = document.createElement('span');
    badge.className = 'badge badge-xs badge-neutral';
    badge.textContent = '…';
    tierCell.appendChild(badge);

    const kbCell = cell('w-14 text-right tabular-nums', '—');
    const msCell = cell('w-14 text-right tabular-nums', '—');
    const hlCell = cell('w-10 text-right tabular-nums', '—');
    const statusCell = cell('w-56 text-[10px] text-base-content/50', 'queued');

    root.append(rankCell, sourceCell, tierCell, kbCell, msCell, hlCell, statusCell);
    this.deps.container.appendChild(root);

    const entry: SourceRow = { root, url, tier: tierCell, kb: kbCell, ms: msCell, hl: hlCell, status: statusCell };
    this.rows.set(key, entry);
    return entry;
  }

  /** Replace a row's tier cell with a badge in the given tone. */
  setBadge(row: SourceRow, text: string, badgeClass: string): void {
    row.tier.replaceChildren();
    const badge = document.createElement('span');
    badge.className = `badge badge-xs ${badgeClass}`;
    badge.textContent = text;
    row.tier.appendChild(badge);
  }

  /** The tier badge a finished source earns. */
  tierBadgeFor(via: ResearchTier): string {
    return TIER_BADGE[via] ?? 'badge-neutral';
  }

  /** Append the "CHECK CITATION" button that revalidates the row's top anchor. */
  appendCitationCheck(row: SourceRow): void {
    const check = document.createElement('button');
    check.className = 'btn btn-xs btn-ghost mt-1';
    check.textContent = 'CHECK CITATION';
    check.title = 'Revalidate the top anchor against the live page';
    check.addEventListener('click', () => void this.checkCitation(row, check));
    row.status.appendChild(check);
  }

  /** Revalidate the row's top anchor in place: score, MISSING, NO RESULT or FAILED. */
  private async checkCitation(row: SourceRow, button: HTMLButtonElement): Promise<void> {
    const anchor = row.anchors?.[0];
    if (!anchor) return;
    button.disabled = true;
    button.textContent = 'CHECKING…';
    try {
      const result = await this.deps.api?.relocateCitation({
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
}
