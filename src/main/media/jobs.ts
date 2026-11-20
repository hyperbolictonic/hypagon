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
 */

import { spawn, type ChildProcess } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { needsLogin } from './auth.ts';
import type { MediaBinary, MediaBinaryError } from './binaries.ts';
import { readJobHistory, JobHistoryWriter } from './job-history.ts';
import { listFiles, newJobId, nowIso, terminate } from './job-files.ts';
import { buildDownloadArgs } from './ytdlp-args.ts';
import { ytdlpRuntimeOptions } from './platform.ts';
import { createQueuedJob, countJobs, MAX_CONCURRENT, MAX_JOBS, pruneFinished, sortJobs } from './job-queue.ts';
import { watchDownload } from './download-stream.ts';
import type { MediaJob, MediaJobInput, MediaJobsOptions } from './job-types.ts';

export type {
  MediaJob,
  MediaJobFile,
  MediaJobInput,
  MediaJobState,
  MediaJobsOptions,
  MediaKind,
  MediaProgress,
  MediaQuality,
} from './job-types.js';


export { buildDownloadArgs, buildFormatSelector, parseProgressLine } from './ytdlp-args.js';
export { listFiles, newJobId, nowIso, terminate } from './job-files.js';

/** When to use: enqueueing, cancelling and listing media jobs from the bridge. */
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
  private readonly history: JobHistoryWriter;
  private closed = false;

  constructor(options: MediaJobsOptions) {
    this.rootDir = options.rootDir;
    this.maxConcurrent = Math.max(1, options.maxConcurrent ?? MAX_CONCURRENT);
    this.resolveBinary = options.resolveBinary;
    this.cookieFileFor = options.cookieFileFor;
    this.onLoginRequired = options.onLoginRequired;
    this.outputDir = options.outputDir;
    this.resolveFfmpeg = options.resolveFfmpeg;
    for (const job of readJobHistory(this.rootDir)) this.jobs.set(job.id, job);
    this.history = new JobHistoryWriter(this.rootDir, () => this.list().slice(0, MAX_JOBS));
  }

  list(): MediaJob[] {
    return sortJobs(this.jobs.values());
  }

  get(id: string): MediaJob | undefined {
    return this.jobs.get(id);
  }

  counts(): { queued: number; running: number; completed: number; failed: number; cancelled: number } {
    return countJobs(this.jobs.values());
  }

  enqueue(input: MediaJobInput): MediaJob {
    const job = createQueuedJob(input);
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.prune();
    this.history.schedule();
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
      this.history.schedule();
      return true;
    }

    if (job.state === 'running') {
      const child = this.running.get(id);
      job.state = 'cancelled';
      job.finishedAt = nowIso();
      this.history.schedule();
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
      void this.cleanupCookies(id);
    }
    this.running.clear();
    this.history.flush();
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
      this.finish(job, 'failed', { code: error.code, message: error.error });
      return;
    }

    const home = path.join(this.outputDir?.().trim() || this.rootDir, job.id);
    const temp = path.join(this.rootDir, '.tmp', job.id);
    try {
      await fsp.mkdir(home, { recursive: true });
      await fsp.mkdir(temp, { recursive: true });
    } catch (error) {
      this.finish(job, 'failed', {
        code: 'OUTPUT_DIR',
        message: `Could not create the output folder: ${error instanceof Error ? error.message : String(error)}`,
      });
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
    job.progress = { percent: 0, downloadedBytes: null, totalBytes: null, speedBytesPerSecond: null, etaSeconds: null, stage: 'starting' };
    this.history.schedule();

    const child = spawn((binary as MediaBinary).path, args, {
      env: runtime.env,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.running.set(job.id, child);

    const watch = watchDownload(child, {
      onProgress: (update) => {
        job.progress = {
          ...(job.progress ?? { percent: null, downloadedBytes: null, totalBytes: null, speedBytesPerSecond: null, etaSeconds: null, stage: 'starting' }),
          ...update,
        };
      },
      onTitle: (title) => {
        job.title = title;
      },
      onIdle: () => terminate(child),
    });

    child.on('error', (error) => {
      watch.stop();
      this.running.delete(job.id);
      void this.cleanupCookies(job.id);
      this.finish(job, 'failed', { code: 'SPAWN_FAILED', message: error.message });
    });

    child.on('close', (code) => {
      watch.stop();
      this.running.delete(job.id);
      void this.complete(job, home, temp, code, watch.stderr(), () => void this.pump());
    });
  }

  private async complete(
    job: MediaJob,
    home: string,
    temp: string,
    code: number | null,
    stderr: string,
    next: () => void,
  ): Promise<void> {
    await this.cleanupCookies(job.id);

    if (job.state === 'cancelled') {
      await fsp.rm(home, { recursive: true, force: true });
      await fsp.rm(temp, { recursive: true, force: true });
      this.history.schedule();
      next();
      return;
    }

    await fsp.rm(temp, { recursive: true, force: true });

    if (code === 0) {
      const files = await listFiles(home);
      if (files.length === 0) {
        this.finish(job, 'failed', { code: 'NO_OUTPUT', message: 'The downloader reported success but wrote no file.' }, next);
        return;
      }
      job.files = files;
      job.progress = {
        ...(job.progress ?? { percent: null, downloadedBytes: null, totalBytes: null, speedBytesPerSecond: null, etaSeconds: null, stage: 'finalising' }),
        percent: 100,
        stage: 'finalising',
      };
      this.finish(job, 'completed', null, next);
      return;
    }

    const detail = stderr.trim().split(/\r?\n/u).filter(Boolean).slice(-3).join(' ').slice(0, 500);
    const loginRequired = needsLogin(stderr);
    this.finish(
      job,
      'failed',
      {
        code: loginRequired ? 'LOGIN_REQUIRED' : 'DOWNLOAD_FAILED',
        message: detail || `The downloader exited with code ${code ?? 'unknown'}`,
      },
      next,
    );
    if (loginRequired) this.onLoginRequired?.(job);
  }

  private async cleanupCookies(id: string): Promise<void> {
    const cleanup = this.cookieCleanups.get(id);
    if (!cleanup) return;
    this.cookieCleanups.delete(id);
    await cleanup();
  }

  private finish(job: MediaJob, state: 'completed' | 'failed' | 'cancelled', error: { code: string; message: string } | null, next?: () => void): void {
    job.state = state;
    job.error = error;
    job.finishedAt = nowIso();
    this.history.schedule();
    next?.();
  }

  private prune(): void {
    for (const id of pruneFinished(this.jobs)) {
      void fsp.rm(path.join(this.rootDir, id), { recursive: true, force: true });
    }
  }
}
