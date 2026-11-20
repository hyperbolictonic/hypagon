/**
 * Metadata reads: one `--dump-single-json` run in, a `MediaInfo` out.
 *
 * The downloader is never given agent-supplied flags. Every argument is built here, and
 * `--ignore-config` keeps a stray yt-dlp config file from adding `--exec` or anything
 * else. Failures are mapped onto the codes the media surface publishes, so a login wall
 * is not reported as a generic extraction error.
 *
 * When to use: `MediaService.info`, or a caller that already resolved the binary and the
 * cookie file. The service keeps policy (URL safety, notifications, binary caching).
 */
import { needsLogin } from './auth.ts';
import { runYtDlpProcess } from './exec.ts';
import { stderrDetail, timeoutFailure } from './dlp-failure.ts';
import { ytdlpRuntimeOptions } from './platform.ts';
import type { MediaBinary } from './binaries.ts';
import type { MediaInfo, MediaInfoResult } from './media-types.ts';

/** When to use: the ceiling for a metadata run. */
export const INFO_TIMEOUT_MS = 45_000;
const INFO_MAX_STDOUT_BYTES = 16 * 1024 * 1024;

function warningCodes(stderr: string): string[] {
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

/** When to use: turning one yt-dlp JSON payload into the published metadata shape. */
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

/**
 * When to use: fetching metadata for an already-validated URL.
 *
 * `onLoginRequired` fires when the site refused the anonymous attempt, so the caller can
 * ask the human to enable the browser session at most once a minute.
 */
export async function fetchInfo(input: {
  url: string;
  binary: MediaBinary;
  cookiesPath: string | null;
  onLoginRequired: () => void;
}): Promise<MediaInfoResult> {
  const runtime = ytdlpRuntimeOptions();
  const args = [
    ...runtime.args,
    '--ignore-config',
    '--no-playlist',
    '--skip-download',
    '--dump-single-json',
    '--no-color',
    '--socket-timeout',
    '20',
    ...(input.cookiesPath === null ? [] : ['--cookies', input.cookiesPath]),
    '--',
    input.url,
  ];

  const result = await runYtDlpProcess(input.binary.path, args, {
    timeoutMs: INFO_TIMEOUT_MS,
    maxStdoutBytes: INFO_MAX_STDOUT_BYTES,
    env: runtime.env,
  });

  if (result.timedOut) {
    return timeoutFailure(INFO_TIMEOUT_MS, 'The downloader');
  }
  if (result.overflowed) {
    return { ok: false, code: 'RESPONSE_TOO_LARGE', error: 'Metadata exceeded the 16 MB limit' };
  }

  if (result.code !== 0) {
    const detail = stderrDetail(result.stderr);
    const loginRequired = needsLogin(result.stderr);
    if (loginRequired) input.onLoginRequired();
    return {
      ok: false,
      code: loginRequired ? 'LOGIN_REQUIRED' : 'EXTRACT_FAILED',
      error: detail === '' ? `The downloader exited with code ${result.code ?? 'unknown'}` : detail,
    };
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(result.stdout) as Record<string, any>;
  } catch {
    return { ok: false, code: 'INVALID_RESPONSE', error: 'The downloader returned metadata that is not JSON' };
  }

  return {
    ok: true,
    media: buildInfo(payload),
    runtime: { kind: runtime.kind, node: runtime.node },
    warnings: warningCodes(result.stderr),
  };
}
