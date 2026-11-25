/**
 * The files a finished job left behind.
 *
 * Why a module: the completion step lists the output folder and filters
 * yt-dlp's partial files. Keeping it here means the queue never imports `fs`.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { MediaJobFile } from './job-types.ts';

/** When to use: after a successful download — the real files, largest first. */
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
