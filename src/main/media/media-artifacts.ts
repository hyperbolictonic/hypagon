/**
 * The no-download read path: subtitles plus an optional poster image.
 *
 * One preview directory holds the caption track and thumbnails; it is removed in a
 * `finally`, so a preview never leaves files behind. Thumbnails larger than 4 MB are
 * skipped rather than shipped into a tool response.
 *
 * When to use: `MediaService.transcript` / `MediaService.preview` — both need the same
 * caption resolution, language choice and image encoding.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fetchArtifacts, type SubtitleArtifacts } from './transcript.ts';
import type { MediaBinary } from './binaries.ts';
import type { MediaInfo, MediaPreviewImage } from './media-types.ts';

const TRANSCRIPT_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 20;
const MAX_IMAGE_BYTES = 4_000_000;

/** When to use: choosing a caption track — explicit request first, then English, then any. */
export function pickLanguage(media: MediaInfo, requested?: string): string {
  const explicit = (requested ?? '').trim();
  if (explicit !== '') return explicit;
  // Prefer English when it exists, then a manual track, then auto captions.
  const manual = media.subtitleLanguages;
  const auto = media.automaticCaptionLanguages;
  const english = (codes: readonly string[]): string | undefined =>
    codes.find((code) => code === 'en') ?? codes.find((code) => code.startsWith('en'));
  return english(manual) ?? english(auto) ?? manual[0] ?? auto[0] ?? 'en';
}

/**
 * When to use: the service's per-URL caption cache — ten minutes, 20 entries, and a
 * record of which transcript was already indexed so a page is not re-indexed on every
 * call.
 */
export class TranscriptCache {
  private readonly entries = new Map<string, { at: number; artifacts: SubtitleArtifacts }>();
  private readonly indexed = new Set<string>();

  /** The cached artifacts for a URL + language, or null when absent or stale. */
  get(key: string): SubtitleArtifacts | null {
    const entry = this.entries.get(key);
    return entry !== undefined && Date.now() - entry.at < TRANSCRIPT_TTL_MS ? entry.artifacts : null;
  }

  /** Store artifacts, evicting the oldest entry past the cap. */
  set(key: string, artifacts: SubtitleArtifacts): void {
    this.entries.set(key, { at: Date.now(), artifacts });
    if (this.entries.size > MAX_CACHE_ENTRIES) {
      const oldest = [...this.entries.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.entries.delete(oldest[0]);
    }
  }

  /** True when this transcript was already written to Cortex. */
  alreadyIndexed(key: string): boolean {
    return this.indexed.has(key);
  }

  /** Remember that this transcript is in Cortex. */
  markIndexed(key: string): void {
    this.indexed.add(key);
  }
}

/**
 * When to use: fetching captions (and optionally thumbnails) for a validated URL.
 *
 * The caller owns the cookie file and the binary resolution; this owns the temporary
 * directory and returns images already encoded for a tool response.
 */
export async function loadArtifacts(input: {
  rootDir: string;
  binary: MediaBinary;
  url: string;
  lang: string;
  includeThumbnail: boolean;
  cookiesPath: string | null;
}): Promise<
  | { readonly ok: true; readonly artifacts: SubtitleArtifacts; readonly images: MediaPreviewImage[] }
  | { readonly ok: false; readonly code: string; readonly error: string }
> {
  const dir = path.join(
    input.rootDir,
    '.preview',
    `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  );

  try {
    const result = await fetchArtifacts(input.binary, input.url, dir, {
      lang: input.lang,
      includeThumbnail: input.includeThumbnail,
      ...(input.cookiesPath === null ? {} : { cookiesPath: input.cookiesPath }),
    });
    if (!result.ok) return result;

    const images: MediaPreviewImage[] = [];
    for (const image of result.artifacts.images) {
      try {
        const stat = await fsp.stat(image.path);
        if (stat.size > MAX_IMAGE_BYTES) continue;
        const data = await fsp.readFile(image.path);
        images.push({ name: image.name, mimeType: image.mimeType, base64: data.toString('base64') });
      } catch {
        // A thumbnail that cannot be read should not fail the preview.
      }
    }

    return { ok: true, artifacts: result.artifacts, images };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
