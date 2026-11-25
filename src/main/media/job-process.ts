/**
 * One yt-dlp process: spawn, line-buffered progress, stderr tail and the two
 * watchdogs.
 *
 * Why a module: the queue should not know how yt-dlp is wired. This module owns
 * the child process, parses its `--newline` output, keeps the last 4 KB of
 * stderr for the failure message, and kills the whole process group on cancel
 * or on an idle/total timeout.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { MediaProgress } from './job-types.ts';
import { parseProgressLine } from './job-format.ts';

const IDLE_TIMEOUT_MS = 120_000;
const TOTAL_TIMEOUT_MS = 45 * 60_000;

/** When to use: `MediaJobs.run` — everything the process needs from the queue. */
export interface DownloadProcessDeps {
  binaryPath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** One parsed progress line from stdout. */
  onProgress: (update: Partial<MediaProgress>) => void;
  /** The `Destination:` basename without its extension. */
  onTitle: (title: string) => void;
  /** The child exited (normally or after a timeout kill). */
  onExit: (code: number | null, stderrTail: string) => void;
  /** The child could not be started at all. */
  onError: (message: string) => void;
}

/** Kill the whole process group; yt-dlp spawns ffmpeg as a child. */
export function terminate(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }, 5_000).unref();
}

/** Split stdout into lines, reporting progress and the first Destination title. */
function wireOutput(child: ChildProcess, deps: DownloadProcessDeps, resetIdle: () => void, tail: { value: string }): void {
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
        deps.onProgress(update);
        resetIdle();
      }
      const destination = line.match(/^\[download\]\s+Destination:\s+(.+)$/u);
      if (destination) deps.onTitle(path.basename(destination[1]).replace(/\.[^.]+$/u, ''));
    }
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    tail.value = `${tail.value}${chunk.toString('utf8')}`.slice(-4_000);
  });
}

/**
 * When to use: `MediaJobs.run` — starts the download and returns the child so
 * the queue can cancel it. The callbacks fire on the process's own events.
 */
export function startDownloadProcess(deps: DownloadProcessDeps): ChildProcess {
  const child = spawn(deps.binaryPath, deps.args, {
    env: deps.env,
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const tail = { value: '' };
  let idleTimer: NodeJS.Timeout;
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      tail.value += `\nNo progress for ${IDLE_TIMEOUT_MS / 1000}s.`;
      terminate(child);
    }, IDLE_TIMEOUT_MS);
  };
  resetIdle();

  const totalTimer = setTimeout(() => {
    tail.value += `\nJob exceeded ${TOTAL_TIMEOUT_MS / 60_000} minutes.`;
    terminate(child);
  }, TOTAL_TIMEOUT_MS);

  wireOutput(child, deps, resetIdle, tail);

  child.on('error', (error) => {
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
    deps.onError(error.message);
  });

  child.on('close', (code) => {
    clearTimeout(idleTimer);
    clearTimeout(totalTimer);
    deps.onExit(code, tail.value);
  });

  return child;
}
