/**
 * Recording files: naming, writing and listing.
 *
 * The service owns configuration and the live handshake with the renderer; what
 * happens on disk is here so a filename and a listing cannot drift apart.
 *
 * When to use: starting a recording (name), saving finished bytes, or answering the
 * recordings list. Paths are absolute and ready for a file-upload field.
 */
import fs from 'node:fs';
import path from 'node:path';

/** When to use: reporting a finished recording (path, bytes, frames) to the caller and HUD. */
export interface RecordingResult {
  path: string;
  filename: string;
  bytes: number;
  frames: number;
  durationMs: number;
  /** Seconds of video produced (frames / fps). */
  videoSeconds: number;
  /** Playback speed-up factor relative to real time. */
  speedup: number;
}

/** When to use: naming a new capture — timestamped, with the human label when given. */
export function recordingFilename(name?: string): string {
  return `${timestamp()}${name ? `-${slug(name)}` : ''}.webm`;
}

/** When to use: writing finished WebM bytes and describing the result for the caller and HUD. */
export function writeRecordingFile(input: {
  outputDir: string;
  filename: string;
  startedAt: number;
  buffer: ArrayBuffer;
  frames: number;
  fps: number;
}): RecordingResult {
  const data = Buffer.from(input.buffer);
  const target = path.join(input.outputDir, input.filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);

  const durationMs = Date.now() - input.startedAt;
  const videoSeconds = input.frames / Math.max(1, input.fps);
  return {
    path: target,
    filename: input.filename,
    bytes: data.length,
    frames: input.frames,
    durationMs,
    videoSeconds: Number(videoSeconds.toFixed(2)),
    speedup: videoSeconds > 0 ? Number((durationMs / 1000 / videoSeconds).toFixed(1)) : 0,
  };
}

/** When to use: listing finished recordings newest first (absolute paths). */
export function listRecordingFiles(
  outputDir: string,
  limit = 50,
): Array<{ path: string; filename: string; bytes: number; modified: number }> {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    return fs
      .readdirSync(outputDir)
      .filter((name) => name.toLowerCase().endsWith('.webm'))
      .map((name) => {
        const full = path.join(outputDir, name);
        const stat = fs.statSync(full);
        return { path: full, filename: name, bytes: stat.size, modified: stat.mtimeMs };
      })
      .sort((a, b) => b.modified - a.modified)
      .slice(0, Math.max(1, Math.min(limit, 500)));
  } catch {
    return [];
  }
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
