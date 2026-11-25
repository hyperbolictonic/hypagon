/**
 * The on-disk job history: `jobs.json` beside the media folders.
 *
 * Why a module: loading, debounced atomic writes and pruning old finished jobs
 * are one responsibility. `MediaJobs` keeps the queue; this keeps the file.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { MediaJob } from './job-types.ts';

const MAX_JOBS = 50;

/** When to use: constructing `MediaJobs` — one history file per root directory. */
export class JobHistoryStore {
  private readonly rootDir: string;
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  /** When to use: the boot — a job that was pending when the app died cannot be resumed. */
  load(): MediaJob[] {
    const file = path.join(this.rootDir, 'jobs.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as { jobs?: MediaJob[] };
      const out: MediaJob[] = [];
      for (const stored of parsed.jobs ?? []) {
        if (!stored || typeof stored.id !== 'string') continue;
        out.push(
          stored.state === 'running' || stored.state === 'queued'
            ? {
                ...stored,
                state: 'failed',
                error: { code: 'INTERRUPTED', message: 'The app exited while this job was pending.' },
                finishedAt: new Date().toISOString(),
              }
            : stored,
        );
      }
      return out;
    } catch {
      // No history yet, or unreadable: start empty.
      return [];
    }
  }

  /** Debounced write (250 ms), for progress updates. */
  scheduleSave(getJobs: () => MediaJob[]): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.save(getJobs);
    }, 250);
    this.persistTimer.unref?.();
  }

  /** Immediate atomic write (temp + rename). */
  save(getJobs: () => MediaJob[]): void {
    try {
      fs.mkdirSync(this.rootDir, { recursive: true });
      const payload = { jobs: getJobs().slice(0, MAX_JOBS) };
      const file = path.join(this.rootDir, 'jobs.json');
      const temp = `${file}.tmp`;
      fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
      fs.renameSync(temp, file);
    } catch {
      // History is a convenience; never fail a job because it could not be saved.
    }
  }

  /** Cancel a pending write (app quit). */
  stop(): void {
    if (!this.persistTimer) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
  }

  /** Drop the oldest finished jobs beyond the cap, and their folders. */
  prune(jobs: Map<string, MediaJob>): void {
    const finished = [...jobs.values()]
      .filter((job) => job.state !== 'queued' && job.state !== 'running')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const job of finished.slice(MAX_JOBS)) {
      jobs.delete(job.id);
      void fsp.rm(path.join(this.rootDir, job.id), { recursive: true, force: true });
    }
  }
}
