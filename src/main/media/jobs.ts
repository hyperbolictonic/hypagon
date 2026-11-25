/**
 * Download jobs for the media surface.
 *
 * One yt-dlp process at a time by default. A job is enqueued and returns
 * immediately; the agent polls `media jobs`. Progress is parsed from yt-dlp's
 * `--newline` output rather than scraped from a rendered terminal.
 *
 * Files land in `<userData>/media/<jobId>/` through a temp directory, so a
 * cancelled job never leaves a half file in the library because the whole job
 * directory is removed on cancel, and yt-dlp writes partials to `.tmp`.
 *
 * Why this file is small: the command line and progress parser live in
 * `job-format.ts`, the child process and its watchdogs in `job-process.ts`, the
 * `jobs.json` history in `job-store.ts` and the completion step in
 * `job-complete.ts`. This class is the queue: admit, run, cancel, shut down.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';

import { ytdlpRuntimeOptions } from './platform.ts';
import type { MediaBinary, MediaBinaryError } from './binaries.ts';
import type { MediaJob, MediaJobInput } from './job-types.ts';
import { blankProgress, buildDownloadArgs } from './job-format.ts';
import { completeJob, finishJob } from './job-complete.ts';
import { JobHistoryStore } from './job-store.ts';
import { startDownloadProcess, terminate } from './job-process.ts';

export type {
  MediaJob,
  MediaJobFile,
  MediaJobInput,
  MediaJobState,
  MediaKind,
  MediaProgress,
  MediaQuality,
} from './job-types.ts';
export { buildDownloadArgs, buildFormatSelector, parseProgressLine } from './job-format.ts';

/** When to use: constructing the queue — paths, binary resolution and the cookie hook. */
export interface MediaJobsOptions {
  readonly rootDir: string;
  readonly resolveBinary: () => Promise<MediaBinary | MediaBinaryError>;
  readonly maxConcurrent?: number;
  /** One-run cookie file for a URL, when the session setting is on. */
  readonly cookieFileFor?: (url: string) => Promise<{ path: string; cleanup(): Promise<void> } | null>;
  /** Called once when a job fails because the site wants a signed-in session. */
  readonly onLoginRequired?: (job: MediaJob) => void;
  /** Base folder for job output. Defaults to `rootDir`. */
  readonly outputDir?: () => string;
  /** Resolved ffmpeg, so the selector can merge and paths can be passed explicitly. */
  readonly resolveFfmpeg?: () => Promise<{ available: boolean; path: string | null }>;
}

const MAX_CONCURRENT = 1;

function nowIso(): string {
  return new Date().toISOString();
}

function newJobId(): string {
  return `mj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Run and forget a one-run cookie file's cleanup, if it registered one. */
async function runCookieCleanup(cleanups: Map<string, () => Promise<void>>, id: string): Promise<void> {
  const cleanup = cleanups.get(id);
  if (!cleanup) return;
  cleanups.delete(id);
  await cleanup();
}

export class MediaJobs {
  private readonly jobs = new Map<string, MediaJob>();
  private readonly running = new Map<string, ChildProcess>();
  private readonly queue: string[] = [];
  private readonly rootDir: string;
  private readonly maxConcurrent: number;
  private readonly resolveBinary: () => Promise<MediaBinary | MediaBinaryError>;
  private readonly cookieFileFor?: MediaJobsOptions['cookieFileFor'];
  private readonly onLoginRequired?: MediaJobsOptions['onLoginRequired'];
  private readonly outputDir?: MediaJobsOptions['outputDir'];
  private readonly resolveFfmpeg?: MediaJobsOptions['resolveFfmpeg'];
  private readonly cookieCleanups = new Map<string, () => Promise<void>>();
  private readonly store: JobHistoryStore;
  private closed = false;

  constructor(options: MediaJobsOptions) {
    this.rootDir = options.rootDir;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? MAX_CONCURRENT);
    this.resolveBinary = options.resolveBinary;
    this.cookieFileFor = options.cookieFileFor;
    this.onLoginRequired = options.onLoginRequired;
    this.outputDir = options.outputDir;
    this.resolveFfmpeg = options.resolveFfmpeg;
    this.store = new JobHistoryStore(this.rootDir);
    for (const job of this.store.load()) this.jobs.set(job.id, job);
  }

  list(): MediaJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(id: string): MediaJob | undefined {
    return this.jobs.get(id);
  }

  counts(): { queued: number; running: number; completed: number; failed: number; cancelled: number } {
    const counts = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const job of this.jobs.values()) counts[job.state] += 1;
    return counts;
  }

  enqueue(input: MediaJobInput): MediaJob {
    const job: MediaJob = {
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
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.store.prune(this.jobs);
    this.persistSoon();
    queueMicrotask(() => void this.pump());
    return { ...job };
  }

  cancel(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.state === 'queued') {
      const index = this.queue.indexOf(id);
      if (index >= 0) this.queue.splice(index, 1);
      job.state = 'cancelled';
      job.finishedAt = nowIso();
      this.persistSoon();
      return true;
    }

    if (job.state === 'running') {
      const child = this.running.get(id);
      job.state = 'cancelled';
      job.finishedAt = nowIso();
      this.persistSoon();
      if (child) terminate(child);
      return true;
    }

    return false;
  }

  /** Kill every child and stop accepting work (app quit). */
  shutdown(): void {
    this.closed = true;
    for (const [id, child] of this.running) {
      const job = this.jobs.get(id);
      if (job) {
        job.state = 'cancelled';
        job.finishedAt = nowIso();
        job.error = { code: 'APP_QUIT', message: 'The app exited while this job was running.' };
      }
      terminate(child);
      void runCookieCleanup(this.cookieCleanups, id);
    }
    this.running.clear();
    this.store.stop();
    this.store.save(() => this.list());
  }

  private async pump(): Promise<void> {
    if (this.closed) return;
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job || job.state !== 'queued') continue;
      void this.run(job);
    }
  }

  private async run(job: MediaJob): Promise<void> {
    const binary = await this.resolveBinary();
    if ((binary as MediaBinaryError).ok === false) {
      const error = binary as MediaBinaryError;
      finishJob(job, 'failed', { code: error.code, message: error.error }, { persistSoon: () => this.persistSoon() });
      return;
    }

    const home = path.join(this.outputDir?.().trim() || this.rootDir, job.id);
    const temp = path.join(this.rootDir, '.tmp', job.id);
    try {
      await fsp.mkdir(home, { recursive: true });
      await fsp.mkdir(temp, { recursive: true });
    } catch (error) {
      finishJob(
        job,
        'failed',
        {
          code: 'OUTPUT_DIR',
          message: `Could not create the output folder: ${error instanceof Error ? error.message : String(error)}`,
        },
        { persistSoon: () => this.persistSoon() },
      );
      return;
    }

    const ffmpeg = await this.resolveFfmpeg?.().catch(() => ({ available: false, path: null }));
    const ffmpegDir =
      ffmpeg?.available && ffmpeg.path !== null && path.isAbsolute(ffmpeg.path) ? path.dirname(ffmpeg.path) : undefined;

    const cookies = await this.cookieFileFor?.(job.url).catch(() => null);
    if (cookies) this.cookieCleanups.set(job.id, cookies.cleanup);

    const args = buildDownloadArgs({
      url: job.url,
      kind: job.kind,
      quality: job.quality,
      home,
      temp,
      ffmpeg: ffmpeg?.available === true,
      ffmpegDir,
      cookies: cookies?.path,
    });
    const runtime = ytdlpRuntimeOptions();

    job.state = 'running';
    job.startedAt = nowIso();
    job.progress = { ...blankProgress('starting'), percent: 0 };
    this.persistSoon();

    const child = startDownloadProcess({
      binaryPath: (binary as MediaBinary).path,
      args,
      env: runtime.env,
      onProgress: (update) => {
        job.progress = { ...(job.progress ?? blankProgress('starting')), ...update };
      },
      onTitle: (title) => {
        job.title = title;
      },
      onExit: (code, stderrTail) => {
        this.running.delete(job.id);
        void completeJob(job, { home, temp }, code, stderrTail, {
          persistSoon: () => this.persistSoon(),
          pump: () => void this.pump(),
          cleanupCookies: (jobId) => runCookieCleanup(this.cookieCleanups, jobId),
          onLoginRequired: this.onLoginRequired,
        });
      },
      onError: (message) => {
        this.running.delete(job.id);
        void runCookieCleanup(this.cookieCleanups, job.id);
        finishJob(job, 'failed', { code: 'SPAWN_FAILED', message }, { persistSoon: () => this.persistSoon() });
      },
    });
    this.running.set(job.id, child);
  }

  private persistSoon(): void {
    this.store.scheduleSave(() => this.list());
  }
}
