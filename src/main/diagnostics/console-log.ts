/**
 * Console-log buffer.
 *
 * The page's console output is captured per tab, capped, and read back by the
 * bridge's diagnostics route. The buffer owns the cap; the chassis forwards the
 * tab manager's events into it.
 */

/** One captured page console line. */
export interface ConsoleLogEntry {
  level: string;
  message: string;
  line: number;
  sourceId: string;
  timestamp: number;
}

/** The bounded, newest-last console buffer. */
export class ConsoleLogBuffer {
  private readonly entries: ConsoleLogEntry[] = [];

  record(entry: ConsoleLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > 200) this.entries.shift();
  }

  tail(limit: number = 50): ConsoleLogEntry[] {
    return this.entries.slice(-limit);
  }
}
