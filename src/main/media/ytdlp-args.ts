/**
 * yt-dlp's command line and its `--newline` progress output.
 *
 * Every argument is built here from typed inputs, never passed through from a caller.
 * The format selector also encodes the ffmpeg reality: without ffmpeg a job can only
 * accept a single file that already carries both streams.
 *
 * When to use: launching a download, or parsing one progress line into `MediaProgress`.
 */
import { ytdlpRuntimeOptions } from './platform.ts';
import type { MediaKind, MediaQuality, MediaProgress } from './job-types.ts';

const MAX_FILESIZE = '2G';

const QUALITY_HEIGHT: Record<Exclude<MediaQuality, 'best' | 'worst'>, number> = {
  '1080': 1080,
  '720': 720,
  '480': 480,
};

/**
 * Format selector for one job.
 *
 * Without ffmpeg yt-dlp cannot merge separate video and audio streams, so the
 * selector asks for a single-file result that already contains both. The
 * `ffmpeg` argument is where the merge path lands once that mode ships.
 */
export function buildFormatSelector(kind: MediaKind, quality: MediaQuality, ffmpeg: boolean): string {
  if (kind === 'audio') {
    return ffmpeg ? 'bestaudio' : 'bestaudio[ext=m4a]/bestaudio';
  }
  if (quality === 'best') {
    return ffmpeg ? 'bestvideo+bestaudio/best' : 'best[ext=mp4]/best';
  }
  if (quality === 'worst') {
    return ffmpeg ? 'worstvideo+worstaudio/worst' : 'worst[ext=mp4]/worst';
  }
  const height = QUALITY_HEIGHT[quality];
  return ffmpeg
    ? `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`
    : `best[height<=${height}][ext=mp4]/best[height<=${height}]`;
}

/** When to use: launching a job — the full argument list for its yt-dlp process. */
export function buildDownloadArgs(input: {
  url: string;
  kind: MediaKind;
  quality: MediaQuality;
  home: string;
  temp: string;
  ffmpeg: boolean;
  ffmpegDir?: string;
  cookies?: string;
}): string[] {
  const runtime = ytdlpRuntimeOptions();
  return [
    ...runtime.args,
    '--ignore-config',
    '--no-playlist',
    '--newline',
    '--no-color',
    '--no-mtime',
    '--socket-timeout',
    '20',
    '--max-filesize',
    MAX_FILESIZE,
    '--retries',
    '3',
    '--paths',
    `home:${input.home}`,
    '--paths',
    `temp:${input.temp}`,
    ...(input.ffmpegDir === undefined ? [] : ['--ffmpeg-location', input.ffmpegDir]),
    '--output',
    '%(title).140B [%(id)s].%(ext)s',
    '--format',
    buildFormatSelector(input.kind, input.quality, input.ffmpeg),
    ...(input.cookies === undefined ? [] : ['--cookies', input.cookies]),
    '--',
    input.url,
  ];
}

/** Parse one `--newline` progress line. Returns null for lines that are not progress. */
export function parseProgressLine(line: string): Partial<MediaProgress> | null {
  const percent = line.match(/^\[download\]\s+(\d+(?:\.\d+)?)%/u);
  if (percent) {
    const size = line.match(/of\s+~?\s*([\d.]+)([KMG]?i?B)/u);
    const speed = line.match(/at\s+([\d.]+)([KMG]?i?B)\/s/u);
    const eta = line.match(/ETA\s+(\d+(?::\d+){1,2})/u);
    const totalBytes = size ? toBytes(Number.parseFloat(size[1]), size[2]) : null;
    const percentValue = Number.parseFloat(percent[1]);
    return {
      stage: 'downloading',
      percent: percentValue,
      // yt-dlp prints the total and the percentage, not the running byte count.
      downloadedBytes: totalBytes === null ? null : Math.round((totalBytes * percentValue) / 100),
      totalBytes,
      speedBytesPerSecond: speed ? toBytes(Number.parseFloat(speed[1]), speed[2]) : null,
      etaSeconds: eta ? toSeconds(eta[1]) : null,
    };
  }
  if (/^\[Merger\]/u.test(line)) return { stage: 'merging' };
  if (/^\[(ExtractAudio|VideoConvertor|FixupM4a|FixupM3u8)/u.test(line)) return { stage: 'postprocessing' };
  if (/^\[download\]\s+(Destination|100%)/u.test(line)) return { stage: 'finalising' };
  return null;
}

function toBytes(value: number, unit: string): number {
  const scale: Record<string, number> = {
    B: 1,
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
  };
  return Math.round(value * (scale[unit] ?? 1));
}

function toSeconds(value: string): number {
  return value.split(':').reduce((total, part) => total * 60 + Number.parseInt(part, 10), 0);
}
