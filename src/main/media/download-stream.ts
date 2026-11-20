/**
 * Watching one yt-dlp process: its `--newline` output, its idle clock and its ceiling.
 *
 * Two timers guard a download — silence for `IDLE_TIMEOUT_MS` and a hard
 * `TOTAL_TIMEOUT_MS` — and both append a human-readable reason to the stderr tail
 * before the caller kills the tree, so a failed job says why.
 *
 * When to use: right after spawning a download. The caller keeps the kill decision
 * and the job state; this only reports.
 */
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { parseProgressLine } from './ytdlp-args.ts';
import { IDLE_TIMEOUT_MS, TOTAL_TIMEOUT_MS } from './job-queue.ts';
import type { MediaProgress } from './job-types.ts';

/** When to use: supplying the job callbacks a download watcher reports through. */
export interface DownloadWatchHooks {
  onProgress(update: Partial<MediaProgress>): void;
  onTitle(title: string): void;
  /** Silence or the ceiling was reached; the caller terminates the process. */
  onIdle(): void;
}

/**
 * When to use: as soon as a download starts — returns the live stderr tail (for the
 * failure message) and `stop()` to release both timers on close.
 */
export function watchDownload(
  child: ChildProcess,
  hooks: DownloadWatchHooks,
): { stderr(): string; stop(): void } {
  let stderrTail = '';
  let idleTimer: NodeJS.Timeout;

  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      stderrTail += `\nNo progress for ${IDLE_TIMEOUT_MS / 1000}s.`;
      hooks.onIdle();
    }, IDLE_TIMEOUT_MS);
  };
  resetIdle();

  const totalTimer = setTimeout(() => {
    stderrTail += `\nJob exceeded ${TOTAL_TIMEOUT_MS / 60_000} minutes.`;
    hooks.onIdle();
  }, TOTAL_TIMEOUT_MS);

  let buffer = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let index = buffer.indexOf('\n');
    while (index >= 0) {
      const line = buffer.slice(0, index).trimEnd();
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf('\n');
      const update = parseProgressLine(line);
      if (update) {
        hooks.onProgress(update);
        resetIdle();
      }
      const destination = line.match(/^\[download\]\s+Destination:\s+(.+)$/u);
      if (destination) hooks.onTitle(path.basename(destination[1]).replace(/\.[^.]+$/u, ''));
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-4_000);
  });

  return {
    stderr: () => stderrTail,
    stop: () => {
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    },
  };
}
