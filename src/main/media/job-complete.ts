/**
 * Finishing a job: move it to a terminal state and, for a completed run, collect
 * the files and describe the failure honestly when there are none.
 *
 * Why a module: the queue's `run` should end at "the child exited". Everything
 * after that — cookie cleanup, temp removal, file listing, login detection — is
 * one step with its own inputs.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { needsLogin } from './auth.ts';
import type { MediaJob } from './job-types.ts';
import { listFiles } from './job-files.ts';

/** When to use: `MediaJobs.run` — what completion needs from the queue. */
export interface CompletionDeps {
  persistSoon(): void;
  pump(): void;
  cleanupCookies(id: string): Promise<void>;
  onLoginRequired?: (job: MediaJob) => void;
}

/** When to use: any terminal transition — sets state/error/time and persists. */
export function finishJob(
  job: MediaJob,
  state: 'completed' | 'failed' | 'cancelled',
  error: { code: string; message: string } | null,
  deps: { persistSoon(): void; next?: () => void },
): void {
  job.state = state;
  job.error = error;
  job.finishedAt = new Date().toISOString();
  deps.persistSoon();
  deps.next?.();
}

/** When to use: the child closed — clean up, collect files or explain the failure. */
export async function completeJob(
  job: MediaJob,
  paths: { home: string; temp: string },
  code: number | null,
  stderr: string,
  deps: CompletionDeps,
): Promise<void> {
  const { home, temp } = paths;
  await deps.cleanupCookies(job.id);

  if (job.state === 'cancelled') {
    await fsp.rm(home, { recursive: true, force: true });
    await fsp.rm(temp, { recursive: true, force: true });
    deps.persistSoon();
    deps.pump();
    return;
  }

  await fsp.rm(temp, { recursive: true, force: true });

  if (code === 0) {
    const files = await listFiles(home);
    if (files.length === 0) {
      finishJob(job, 'failed', { code: 'NO_OUTPUT', message: 'The downloader reported success but wrote no file.' }, {
        persistSoon: deps.persistSoon,
        next: deps.pump,
      });
      return;
    }
    job.files = files;
    job.progress = {
      ...(job.progress ?? {
        percent: null,
        downloadedBytes: null,
        totalBytes: null,
        speedBytesPerSecond: null,
        etaSeconds: null,
        stage: 'finalising',
      }),
      percent: 100,
      stage: 'finalising',
    };
    finishJob(job, 'completed', null, { persistSoon: deps.persistSoon, next: deps.pump });
    return;
  }

  const detail = stderr.trim().split(/\r?\n/u).filter(Boolean).slice(-3).join(' ').slice(0, 500);
  const loginRequired = needsLogin(stderr);
  finishJob(
    job,
    'failed',
    {
      code: loginRequired ? 'LOGIN_REQUIRED' : 'DOWNLOAD_FAILED',
      message: detail || `The downloader exited with code ${code ?? 'unknown'}`,
    },
    { persistSoon: deps.persistSoon, next: deps.pump },
  );
  if (loginRequired) deps.onLoginRequired?.(job);
}
