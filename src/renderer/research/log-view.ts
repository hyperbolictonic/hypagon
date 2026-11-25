/**
 * The research terminal: the elapsed-time stamp on every line and the line count.
 *
 * Why a module: the run clock, the log DOM and the counter move together (`reset` starts
 * the clock, `write` stamps against it), and the event handlers only say what to report.
 */

/** When to use: `initResearchPanel` — the nodes the log writes into. */
export interface ResearchLogDeps {
  log: HTMLElement;
  logCount: HTMLElement | null;
}

/** When to use: `initResearchPanel` — one log per panel. */
export class ResearchLog {
  private readonly deps: ResearchLogDeps;
  private startedAt = 0;
  private lineCount = 0;

  constructor(deps: ResearchLogDeps) {
    this.deps = deps;
  }

  /** How many lines have been written in this run. */
  get lines(): number {
    return this.lineCount;
  }

  /** Begin a run clock at `at` (an activity event carries its own start time). */
  start(at: number = Date.now()): void {
    if (!this.startedAt) this.startedAt = at;
  }

  /** Empty the terminal, restart the clock and zero the count. */
  reset(at: number = Date.now()): void {
    this.deps.log.replaceChildren();
    this.startedAt = at;
    this.lineCount = 0;
    if (this.deps.logCount) this.deps.logCount.textContent = '0 lines';
  }

  /** Append one stamped line and keep it scrolled into view. */
  write(text: string, tone = 'text-base-content/60'): void {
    const { log, logCount } = this.deps;
    const row = document.createElement('div');
    row.className = 'flex gap-1.5';

    const stamp = document.createElement('span');
    stamp.className = 'text-base-content/30 shrink-0 tabular-nums';
    stamp.textContent = `${((Date.now() - this.startedAt) / 1000).toFixed(1)}s`;

    const body = document.createElement('span');
    body.className = tone;
    body.textContent = text;

    row.append(stamp, body);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;

    this.lineCount++;
    if (logCount) logCount.textContent = `${this.lineCount} lines`;
  }
}
