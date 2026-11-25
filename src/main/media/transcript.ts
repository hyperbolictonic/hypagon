/**
 * Subtitles and thumbnails without downloading the media.
 *
 * `--skip-download` makes yt-dlp fetch only the caption track and the poster
 * image, which is enough to decide whether a video is worth downloading.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { runYtDlpProcess } from './exec.ts';
import { processFailure } from './process-failure.ts';
import { ytdlpRuntimeOptions } from './platform.ts';
import type { MediaBinary } from './binaries.ts';

const SUBTITLE_TIMEOUT_MS = 45_000;

/**
 * VTT → plain text.
 *
 * Removes the header, NOTE blocks, cue timings, cue settings and inline tags,
 * decodes the common entities, and drops consecutive duplicate lines (auto
 * captions repeat the previous line while it scrolls).
 */
export function parseVtt(input: string): string {
  const lines = input.replace(/\r\n/gu, '\n').split('\n');
  const out: string[] = [];
  let inNote = false;
  let inHeader = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (/^WEBVTT\b/u.test(line)) {
      inHeader = true;
      continue;
    }
    if (line === '') {
      inHeader = false;
      inNote = false;
      continue;
    }
    if (inHeader) continue;
    if (/^NOTE\b/u.test(line)) {
      inNote = true;
      continue;
    }
    if (inNote) continue;
    if (line.includes('-->')) continue;
    if (/^\d+$/u.test(line)) continue;

    const text = line
      .replace(/<[^>]+>/gu, '')
      .replace(/&amp;/gu, '&')
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>')
      .replace(/&nbsp;/gu, ' ')
      .replace(/&#39;/gu, "'")
      .replace(/&quot;/gu, '"')
      .replace(/\s+/gu, ' ')
      .trim();

    if (text === '') continue;
    if (out.length > 0 && out[out.length - 1] === text) continue;
    out.push(text);
  }

  return out.join('\n');
}

export interface SubtitleArtifacts {
  readonly text: string;
  readonly language: string;
  readonly automatic: boolean;
  readonly availableLanguages: readonly string[];
  readonly images: { readonly name: string; readonly path: string; readonly mimeType: string }[];
}

/**
 * The document stored in Cortex for one transcript.
 *
 * The title and source line give `recall_memory` context it can quote; the body
 * stays plain text so a chunk is useful on its own.
 */
export function transcriptDocument(input: {
  title: string;
  url: string;
  language: string;
  automatic: boolean;
  text: string;
}): string {
  return [
    `# ${input.title}`,
    '',
    `Source: ${input.url}`,
    `Captions: ${input.language}${input.automatic ? ' (automatic)' : ''}`,
    '',
    input.text,
  ].join('\n');
}

export type ArtifactResult =
  | { readonly ok: true; readonly artifacts: SubtitleArtifacts }
  | { readonly ok: false; readonly code: string; readonly error: string };

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function pickSubtitle(dir: string): string | null {
  const files = fs.readdirSync(dir);
  const vtt = files.filter((name) => name.endsWith('.vtt')).sort();
  if (vtt.length === 0) return null;
  // Prefer a manual track when both manual and auto exist.
  const manual = vtt.find((name) => !name.includes('.orig.'));
  return path.join(dir, manual ?? vtt[0]!);
}

function readInfo(dir: string): Record<string, any> | null {
  const infoFile = fs.readdirSync(dir).find((name) => name.endsWith('.info.json'));
  if (!infoFile) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, infoFile), 'utf8')) as Record<string, any>;
  } catch {
    return null;
  }
}

/** The yt-dlp argument list for a caption-only fetch into `dir`. */
function captionArgs(
  runtime: { args: readonly string[] },
  url: string,
  dir: string,
  options: { lang: string; cookiesPath?: string; includeThumbnail?: boolean },
): string[] {
  return [
    ...runtime.args,
    '--ignore-config',
    '--no-playlist',
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    options.lang,
    '--sub-format',
    'vtt',
    '--write-info-json',
    ...(options.includeThumbnail === true ? ['--write-thumbnail'] : []),
    '--no-color',
    '--socket-timeout',
    '20',
    '--paths',
    `home:${dir}`,
    '--paths',
    `temp:${dir}`,
    '--output',
    '%(id)s.%(ext)s',
    ...(options.cookiesPath === undefined ? [] : ['--cookies', options.cookiesPath]),
    '--',
    url,
  ];
}

/** What the caption-only fetch left in `dir`: the text, its track and any thumbnail. */
function readArtifacts(dir: string, lang: string) {
  const info = readInfo(dir);
  const subtitleFile = pickSubtitle(dir);
  const text = subtitleFile ? parseVtt(fs.readFileSync(subtitleFile, 'utf8')) : '';

  const manualLanguages: string[] = Object.keys(info?.subtitles ?? {});
  const autoLanguages: string[] = Object.keys(info?.automatic_captions ?? {});
  const availableLanguages = [...new Set([...manualLanguages, ...autoLanguages])].sort();

  const selected = subtitleFile ? path.basename(subtitleFile) : '';
  const automatic = selected !== '' && !manualLanguages.some((code) => selected.includes(`.${code}.`));
  const language = availableLanguages.find((code) => selected.includes(`.${code}.`)) ?? lang;

  const images = fs.readdirSync(dir)
    .filter((name) => /\.(jpe?g|png|webp|gif)$/iu.test(name))
    .sort()
    .slice(0, 2)
    .map((name) => ({ name, path: path.join(dir, name), mimeType: mimeFor(name) }));

  return { text, language, automatic, availableLanguages, images };
}

/**
 * Fetch captions (and optionally the thumbnail) into `dir`.
 *
 * `lang` is a yt-dlp subtitle selector; the caller normally derives it from the
 * metadata's available languages.
 */
export async function fetchArtifacts(
  binary: MediaBinary,
  url: string,
  dir: string,
  options: { lang: string; cookiesPath?: string; includeThumbnail?: boolean },
): Promise<ArtifactResult> {
  await fsp.mkdir(dir, { recursive: true });
  const runtime = ytdlpRuntimeOptions();

  const result = await runYtDlpProcess(binary.path, captionArgs(runtime, url, dir, options), {
    timeoutMs: SUBTITLE_TIMEOUT_MS,
    maxStdoutBytes: 2 * 1024 * 1024,
    env: runtime.env,
  });

  const failed = processFailure(
    result,
    {
      timeout: 'caption fetch did not finish in',
      detailLines: 3,
      detailChars: 400,
      loginFallback: 'the site wants a signed-in session',
    },
    { timeoutMs: SUBTITLE_TIMEOUT_MS },
  );
  if (failed) return failed;

  const artifacts = readArtifacts(dir, options.lang);
  if (artifacts.text === '' && artifacts.images.length === 0) {
    return {
      ok: false,
      code: 'NO_TRANSCRIPT',
      error:
        artifacts.availableLanguages.length === 0
          ? 'This video has no subtitles.'
          : `No subtitles for "${options.lang}". Available: ${artifacts.availableLanguages.slice(0, 8).join(', ')}`,
    };
  }

  return { ok: true, artifacts };
}
