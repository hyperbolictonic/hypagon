/**
 * yt-dlp's metadata JSON → the flat `MediaInfo` the bridge returns.
 *
 * Why a module: the payload is untrusted and every field needs the same
 * coercion. Keeping the mapping out of the service means the reader only has to
 * say "run the dump, parse it, map it".
 */
import type { MediaInfo } from './media-types.ts';

/** stderr markers worth surfacing as warnings rather than failures. */
export function warningCodes(stderr: string): string[] {
  const warnings: string[] = [];
  if (/No supported JavaScript runtime/i.test(stderr)) warnings.push('js_runtime_missing');
  if (/ffmpeg not found/i.test(stderr)) warnings.push('ffmpeg_missing');
  return warnings;
}

function scalar(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function languageKeys(value: unknown): string[] {
  if (value === null || typeof value !== 'object') return [];
  return Object.keys(value as Record<string, unknown>).sort();
}

/** When to use: after `--dump-single-json` — one payload to the public shape. */
export function buildInfo(payload: Record<string, any>): MediaInfo {
  const formats: any[] = Array.isArray(payload.formats) ? payload.formats : [];
  const heights = formats
    .map((format) => numberOrNull(format?.height))
    .filter((height): height is number => height !== null);

  return {
    id: scalar(payload.id),
    title: scalar(payload.title),
    durationSeconds: numberOrNull(payload.duration),
    uploader: scalar(payload.uploader) ?? scalar(payload.channel) ?? scalar(payload.creator),
    extractor: scalar(payload.extractor_key) ?? scalar(payload.extractor),
    webpageUrl: scalar(payload.webpage_url) ?? scalar(payload.original_url),
    thumbnail: scalar(payload.thumbnail),
    isLive: payload.is_live === true,
    ageLimit: numberOrNull(payload.age_limit),
    formatCount: formats.length,
    maxHeight: heights.length > 0 ? Math.max(...heights) : null,
    audioOnly: formats.length > 0 && formats.every((format) => format?.vcodec === 'none'),
    subtitleLanguages: languageKeys(payload.subtitles),
    automaticCaptionLanguages: languageKeys(payload.automatic_captions),
  };
}
