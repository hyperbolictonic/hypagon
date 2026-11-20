/**
 * The no-download read pipeline: `transcript` and `preview`.
 *
 * Both start from metadata, pick a caption track, then resolve artifacts once through
 * `loadArtifacts`. A transcript is paged and cached; a preview also carries the poster
 * image and degrades to metadata-only when captions are unavailable (but not when the
 * site demanded a login — that is reported as a refusal).
 *
 * When to use: `MediaService.transcript` / `MediaService.preview`. The service supplies
 * binary resolution, the cookie handoff and its cache.
 */
import { cortex } from '../cortex/cortex-db.js';
import { transcriptDocument, type SubtitleArtifacts } from './transcript.ts';
import { loadArtifacts, pickLanguage, type TranscriptCache } from './media-artifacts.ts';
import { isMediaBinary, type MediaBinary, type MediaBinaryError } from './binaries.ts';
import type { MediaInfoResult, MediaPreviewImage, MediaPreviewResult, MediaTranscriptResult } from './media-types.ts';

type ArtifactsResult =
  | { readonly ok: true; readonly artifacts: SubtitleArtifacts; readonly images: MediaPreviewImage[] }
  | { readonly ok: false; readonly code: string; readonly error: string };

type MediaInfoOk = Extract<MediaInfoResult, { ok: true }>;

/** When to use: constructing a MediaReader from the service's own dependencies. */
export interface MediaReadDeps {
  readonly rootDir: string;
  readonly cache: TranscriptCache;
  /** Metadata, including URL policy and the login notification. */
  readonly info: (rawUrl: string) => Promise<MediaInfoResult>;
  readonly resolveBinary: () => Promise<MediaBinary | MediaBinaryError>;
  readonly cookiesFor: (url: string) => Promise<{ path: string; cleanup(): Promise<void> } | null>;
}

/** When to use: the service's `transcript` and `preview` methods; it holds no policy of its own. */
export class MediaReader {
  constructor(private readonly deps: MediaReadDeps) {}

  /**
   * Captions as text, without downloading the media. Paged with
   * `maxChars`/`cursor`, and cached for ten minutes per URL + language.
   */
  async transcript(
    rawUrl: string,
    options: { lang?: string; maxChars?: number; cursor?: number; index?: boolean } = {},
  ): Promise<MediaTranscriptResult> {
    const info = await this.loadInfo(rawUrl);
    if (!info.ok) return info;

    const url = rawUrl.trim();
    const lang = pickLanguage(info.media, options.lang);
    const key = `${url}|${lang}`;
    let artifacts: SubtitleArtifacts | null = this.deps.cache.get(key);

    if (artifacts === null) {
      const fetched = await this.artifactsFor(url, lang, false);
      if (!fetched.ok) return { ok: false, code: fetched.code, error: fetched.error };
      artifacts = fetched.artifacts;
      this.deps.cache.set(key, artifacts);
    }

    // Index the full transcript once, not the page the caller asked for.
    let indexed: { chunks: number; error?: string } | undefined;
    if (options.index !== false && artifacts.text !== '' && !this.deps.cache.alreadyIndexed(key)) {
      try {
        const document = transcriptDocument({
          title: info.media.title ?? url,
          url,
          language: artifacts.language,
          automatic: artifacts.automatic,
          text: artifacts.text,
        });
        const chunks = await cortex.indexPage(url, `${info.media.title ?? url} (transcript)`, document);
        this.deps.cache.markIndexed(key);
        indexed = { chunks };
      } catch (error) {
        indexed = { chunks: 0, error: error instanceof Error ? error.message : String(error) };
      }
    }

    const total = artifacts.text.length;
    const max = Math.min(20_000, Math.max(500, Math.round(options.maxChars ?? 8_000)));
    const cursor = Math.min(total, Math.max(0, Math.round(options.cursor ?? 0)));
    const text = artifacts.text.slice(cursor, cursor + max);
    const nextCursor = cursor + text.length < total ? cursor + text.length : null;

    return {
      ok: true,
      language: artifacts.language,
      automatic: artifacts.automatic,
      text,
      chars: text.length,
      totalChars: total,
      truncated: nextCursor !== null,
      nextCursor,
      availableLanguages: artifacts.availableLanguages,
      ...(indexed === undefined ? {} : { indexed }),
    };
  }

  /**
   * A no-download preview: metadata, a transcript excerpt, and the poster image
   * (returned as image content by the MCP layer).
   */
  async preview(
    rawUrl: string,
    options: { lang?: string; maxChars?: number; thumbnail?: boolean } = {},
  ): Promise<MediaPreviewResult> {
    const info = await this.loadInfo(rawUrl);
    if (!info.ok) return info;

    const url = rawUrl.trim();
    const lang = pickLanguage(info.media, options.lang);
    const fetched = await this.artifactsFor(url, lang, options.thumbnail !== false);
    const warnings = [...info.warnings];

    if (!fetched.ok) {
      if (fetched.code === 'LOGIN_REQUIRED') return { ok: false, code: fetched.code, error: fetched.error };
      warnings.push(fetched.code);
      return { ok: true, media: info.media, transcript: null, warnings, images: [] };
    }

    if (fetched.artifacts.text !== '') this.deps.cache.set(`${url}|${lang}`, fetched.artifacts);

    const total = fetched.artifacts.text.length;
    const text = fetched.artifacts.text.slice(0, Math.min(8_000, Math.max(200, Math.round(options.maxChars ?? 1_200))));

    return {
      ok: true,
      media: info.media,
      warnings,
      transcript:
        total === 0
          ? null
          : {
              language: fetched.artifacts.language,
              automatic: fetched.artifacts.automatic,
              text,
              chars: text.length,
              totalChars: total,
              truncated: text.length < total,
            },
      images: fetched.images.slice(0, 2),
    };
  }

  /**
   * Metadata, narrowed to the success case.
   *
   * Both reads start the same way; this keeps the refusal shape identical without
   * repeating the prologue in each method.
   */
  private async loadInfo(rawUrl: string): Promise<MediaInfoOk | { ok: false; code: string; error: string }> {
    const info = await this.deps.info(rawUrl);
    return info.ok ? info : { ok: false, code: info.code, error: info.error };
  }

  private async artifactsFor(url: string, lang: string, includeThumbnail: boolean): Promise<ArtifactsResult> {
    const binary = await this.deps.resolveBinary();
    if (!isMediaBinary(binary)) return { ok: false, code: binary.code, error: binary.error };

    const cookies = await this.deps.cookiesFor(url);
    try {
      return await loadArtifacts({
        rootDir: this.deps.rootDir,
        binary,
        url,
        lang,
        includeThumbnail,
        cookiesPath: cookies === null ? null : cookies.path,
      });
    } finally {
      await cookies?.cleanup();
    }
  }
}
