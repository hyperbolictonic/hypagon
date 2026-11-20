/**
 * Queue rules for media jobs: the bounds, how a new job is born, and derived views.
 *
 * These are pure or near-pure, so the class in `jobs.ts` reads as orchestration and a
 * test can exercise the policy without spawning anything.
 *
 * When to use: enqueueing, listing/counting jobs, or pruning finished history.
 */
import { newJobId, nowIso } from './job-files.ts';
import type { MediaJob, MediaJobInput } from './job-types.ts';

/** When to use: the cap on remembered jobs (newest kept). */
export const MAX_JOBS = 50;
/** When to use: the default number of downloads running at once. */
export const MAX_CONCURRENT = 1;
/** When to use: how long a silent download may run before it is killed. */
export const IDLE_TIMEOUT_MS = 120_000;
/** When to use: the absolute ceiling for one download. */
export const TOTAL_TIMEOUT_MS = 45 * 60_000;

/** When to use: turning an enqueue request into the job record that is polled. */
export function createQueuedJob(input: MediaJobInput): MediaJob {
  return {
    id: newJobId(),
    url: input.url,
    kind: input.kind ?? 'video',
    quality: input.quality ?? 'best',
    state: 'queued',
    title: null,
    progress: null,
    files: [],
    error: null,
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
  };
}

/** When to use: listing jobs — newest first. */
export function sortJobs(jobs: Iterable<MediaJob>): MediaJob[] {
  return [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** When to use: the `media jobs` summary line. */
export function countJobs(jobs: Iterable<MediaJob>): {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
} {
  const counts = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
  for (const job of jobs) counts[job.state] += 1;
  return counts;
}

/**
 * When to use: after an enqueue — drop the oldest finished jobs beyond the cap and
 * return their ids so the caller can delete their folders.
 */
export function pruneFinished(jobs: Map<string, MediaJob>, limit = MAX_JOBS): string[] {
  const finished = sortJobs(jobs.values()).filter((job) => job.state !== 'queued' && job.state !== 'running');
  const removed: string[] = [];
  for (const job of finished.slice(limit)) {
    jobs.delete(job.id);
    removed.push(job.id);
  }
  return removed;
}
