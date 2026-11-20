/**
 * Job history on disk (`<rootDir>/jobs.json`).
 *
 * History is a convenience: an unreadable file starts empty, and a failed write never
 * fails a job. A job that was queued/running when the app died is reported as
 * interrupted rather than silently resumed.
 *
 * When to use: the job queue's load and its debounced save. Policy stays in `jobs.ts`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from './job-files.ts';
import type { MediaJob } from './job-types.ts';

const HISTORY_FILE = 'jobs.json';

/** When to use: restoring history at startup; interrupted jobs are marked failed. */
export function readJobHistory(rootDir: string): MediaJob[] {
  const file = path.join(rootDir, HISTORY_FILE);
  const jobs: MediaJob[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { jobs?: MediaJob[] };
    for (const stored of parsed.jobs ?? []) {
      if (!stored || typeof stored.id !== 'string') continue;
      // A job that was running when the app died cannot be resumed.
      jobs.push(
        stored.state === 'running' || stored.state === 'queued'
          ? { ...stored, state: 'failed', error: { code: 'INTERRUPTED', message: 'The app exited while this job was pending.' }, finishedAt: nowIso() }
          : stored,
      );
    }
  } catch {
    // No history yet, or unreadable: start empty.
  }
  return jobs;
}

/** When to use: writing history atomically (temp file, then rename). */
export function writeJobHistory(rootDir: string, jobs: MediaJob[]): void {
  try {
    fs.mkdirSync(rootDir, { recursive: true });
    const file = path.join(rootDir, HISTORY_FILE);
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify({ jobs }, null, 2)}\n`, 'utf8');
    fs.renameSync(temp, file);
  } catch {
    // History is a convenience; never fail a job because it could not be saved.
  }
}

/**
 * When to use: a queue that changes often — coalesces writes into one 250 ms save and
 * flushes synchronously on shutdown.
 */
export class JobHistoryWriter {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly rootDir: string,
    private readonly snapshot: () => MediaJob[],
    private readonly delayMs = 250,
  ) {}

  /** Ask for a save soon; repeated calls within the window collapse into one. */
  schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
    this.timer.unref?.();
  }

  /** Write the current snapshot now (also cancels a pending debounce). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    writeJobHistory(this.rootDir, this.snapshot());
  }
}
