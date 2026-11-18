/**
 * Screenshot store: where captures live and how old ones are pruned.
 *
 * Captures are written next to the app's data directory and pruned on every write,
 * so a long-running agent cannot fill the disk with full-page dumps.
 *
 * When to use: a capture is about to be written, or the cleanup route / disk
 * maintenance pass needs to trim the capture folder.
 */

import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../data-paths.js';

/** When to use: writing a screenshot and needing the capture folder (created if absent). */
export function screenshotsDir(): string {
  const dir = dataPath('screenshots');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * When to use: writing a capture to disk and running the retention pass, then handing
 * back the path for telemetry and the response.
 */
export function saveCapture(buffer: Buffer, filename: string): string {
  const filePath = path.join(screenshotsDir(), filename);
  fs.writeFileSync(filePath, buffer);
  pruneScreenshots(50);
  return filePath;
}

/**
 * When to use: trimming old captures — called after every write and by
 * `POST /screenshots/cleanup`. Deletes anything older than `maxAgeMs`, then the
 * oldest files until at most `maxFiles` remain.
 */
export function pruneScreenshots(
  maxFiles: number = 50,
  maxAgeMs: number = 7 * 24 * 60 * 60 * 1000,
): { prunedCount: number; remainingCount: number } {
  try {
    const dir = screenshotsDir();
    const files = fs.readdirSync(dir);
    const now = Date.now();
    const screenshotFiles: { file: string; fullPath: string; mtimeMs: number; size: number }[] = [];

    for (const file of files) {
      // Both capture formats count: jpeg is the default and used to be skipped here,
      // which left every jpeg accumulating forever.
      if (!/\.(png|jpe?g)$/i.test(file)) continue;
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        screenshotFiles.push({ file, fullPath, mtimeMs: stat.mtimeMs, size: stat.size });
      } catch {
        // ignore stat errors
      }
    }

    // Sort oldest first
    screenshotFiles.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let prunedCount = 0;
    const keepFiles: typeof screenshotFiles = [];

    for (const item of screenshotFiles) {
      const isExpired = now - item.mtimeMs > maxAgeMs;
      const wouldExceedLimit = screenshotFiles.length - prunedCount > maxFiles;

      if (isExpired || wouldExceedLimit) {
        try {
          fs.unlinkSync(item.fullPath);
          prunedCount++;
        } catch (err: any) {
          console.error(`[Hypagon] Failed to prune screenshot ${item.file}:`, err);
          keepFiles.push(item);
        }
      } else {
        keepFiles.push(item);
      }
    }

    return { prunedCount, remainingCount: keepFiles.length };
  } catch (err: any) {
    console.error('[Hypagon] Error in screenshot cleanup:', err);
    return { prunedCount: 0, remainingCount: 0 };
  }
}
