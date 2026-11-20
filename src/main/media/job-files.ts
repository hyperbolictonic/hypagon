/**
 * Process and filesystem helpers for a media job: ids, timestamps, killing a
 * download tree, and describing the finished files.
 *
 * Kept separate because each has a platform detail worth reading on its own — Windows
 * needs `taskkill /T`, POSIX kills the process group — and none of it is queue policy.
 *
 * When to use: launching/cancelling a job or assembling its result.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { MediaJobFile } from './job-types.ts';

/** When to use: stamping a job transition. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** When to use: creating the id a job is polled and cancelled by. */
export function newJobId(): string {
  return `mj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * When to use: stopping a download.
 *
 * Windows has no process groups for this purpose, so the whole tree goes via
 * `taskkill /T`; elsewhere the child leads its own group and a SIGKILL follows in 5 s
 * if SIGTERM was not enough.
 */
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

/** When to use: describing a job's output folder — real files only, largest first. */
export async function listFiles(dir: string): Promise<MediaJobFile[]> {
  const out: MediaJobFile[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (/\.(part|ytdl|tmp)$/u.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    try {
      const stat = await fsp.stat(full);
      out.push({ name: entry.name, path: full, bytes: stat.size });
    } catch {
      // Vanished between readdir and stat.
    }
  }
  return out.sort((a, b) => b.bytes - a.bytes);
}
