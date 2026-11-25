/**
 * The reading paths: metadata, captions and a no-download preview.
 *
 * Why a module: `info`, `transcript` and `preview` all begin with the same
 * guards (safe URL, resolved binary, one-run cookie file) and share the caption
 * cache. Keeping them together means the facade never grows another read path,
 * and each method can be read on its own.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';

import { ensureYtDlp, isMediaBinary, type MediaBinary, type MediaBinaryError } from './binaries.ts';
import { cortex } from '../cortex/cortex-db.js';
import { fetchArtifacts, transcriptDocument, type SubtitleArtifacts } from './transcript.ts';
import { runYtDlpProcess } from './exec.ts';
import { processFailure } from './process-failure.ts';
import { ytdlpRuntimeOptions } from './platform.ts';
import { assertSafeUrl, WrapSecurityError } from '../wrap/security.ts';
import { buildInfo, warningCodes } from './info-payload.ts';
import type {
  MediaInfo,
  MediaInfoResult,
  MediaPreviewImage,
  MediaPreviewResult,
  MediaTranscriptResult,
} from './media-types.ts';

const INFO_TIMEOUT_MS = 45_000;
const INFO_MAX_STDOUT_BYTES = 16 * 1024 * 1024;
const INFO_MAX_STDERR_BYTES = 256 * 1024;

/** When to use: constructing the reader — the facade owns the binary promise and cookies. */
export interface MediaReaderDeps {
  rootDir: string;
  resolveBinary(): Promise<MediaBinary | MediaBinaryError>;
  /** A one-run cookie file for this URL, when the human enabled the browser session. */
  cookieFileFor(url: string): Promise<{ path: string; cleanup(): Promise<void> } | null>;
  /** Called when the site refuses an anonymous request. */
  onLoginRequired(): void;
}

/** When to use: `/media/info`, `/media/transcript` and `/media/preview`. */
export class MediaReader {
  private readonly rootDir: string;
  private readonly resolveBinary: MediaReaderDeps['resolveBinary'];
  private readonly cookieFileFor: MediaReaderDeps['cookieFileFor'];
  private readonly onLoginRequired: MediaReaderDeps['onLoginRequired'];
  private readonly transcriptCache = new Map<string, { at: number; artifacts: SubtitleArtifacts }>();
  private readonly indexedTranscripts = new Set<string>();

  constructor(deps: MediaReaderDeps) {
    this.rootDir = deps.rootDir;
    this.resolveBinary = deps.resolveBinary;
    this.cookieFileFor = deps.cookieFileFor;
    this.onLoginRequired = deps.onLoginRequired;
  }

  async info(rawUrl: string): Promise<MediaInfoResult> {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (url === '') {
      return { ok: false, code: 'BAD_REQUEST', error: 'url is required' };
    }

    try {
      await assertSafeUrl(url);
    } catch (error) {
      if (error instanceof WrapSecurityError) {
        return { ok: false, code: error.code, error: error.message };
      }
      return { ok: false, code: 'INVALID_URL', error: error instanceof Error ? error.message : String(error) };
    }

    const resolved = await this.binaryOrFailure();
    if (!resolved.ok) return resolved;

    const runtime = ytdlpRuntimeOptions();
    const cookies = await this.cookieFileFor(url);
    const args = [
      ...runtime.args,
      '--ignore-config',
      '--no-playlist',
      '--skip-download',
      '--dump-single-json',
      '--no-color',
      '--socket-timeout',
      '20',
      ...(cookies === null ? [] : ['--cookies', cookies.path]),
      '--',
      url,
    ];

    try {
      const result = await runYtDlpProcess(resolved.binary.path, args, {
        timeoutMs: INFO_TIMEOUT_MS,
        maxStdoutBytes: INFO_MAX_STDOUT_BYTES,
        env: runtime.env,
      });

      const failed = processFailure(
        result,
        { timeout: 'The downloader did not answer within', detailLines: 4, detailChars: 500 },
        { timeoutMs: INFO_TIMEOUT_MS, overflowError: 'Metadata exceeded the 16 MB limit' },
      );
      if (failed) {
        if (failed.code === 'LOGIN_REQUIRED') this.onLoginRequired();
        return failed;
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
    } finally {
      await cookies?.cleanup();
    }
  }

  /**
   * Captions as text, without downloading the media. Paged with
   * `maxChars`/`cursor`, and cached for ten minutes per URL + language.
   */
  async transcript(
    rawUrl: string,
    options: { lang?: string; maxChars?: number; cursor?: number; index?: boolean } = {},
  ): Promise<MediaTranscriptResult> {
    const located = await this.locateMedia(rawUrl, options.lang);
    if (!located.ok) return located;

    const { url, lang, info } = located;
    const key = `${url}|${lang}`;
    const cached = this.transcriptCache.get(key);
    let artifacts: SubtitleArtifacts | null =
      cached !== undefined && Date.now() - cached.at < 10 * 60_000 ? cached.artifacts : null;

    if (artifacts === null) {
      const fetched = await this.artifactsFor(url, lang, false);
      if (!fetched.ok) return { ok: false, code: fetched.code, error: fetched.error };
      artifacts = fetched.artifacts;
      this.cacheArtifacts(key, artifacts);
    }

    // Index the full transcript once, not the page the caller asked for.
    let indexed: { chunks: number; error?: string } | undefined;
    if (options.index !== false && artifacts.text !== '' && !this.indexedTranscripts.has(key)) {
      try {
        const document = transcriptDocument({
          title: info.media.title ?? url,
          url,
          language: artifacts.language,
          automatic: artifacts.automatic,
          text: artifacts.text,
        });
        const chunks = await cortex.history.indexPage(url, `${info.media.title ?? url} (transcript)`, document);
        this.indexedTranscripts.add(key);
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
    const located = await this.locateMedia(rawUrl, options.lang);
    if (!located.ok) return located;

    const { url, lang, info } = located;
    const fetched = await this.artifactsFor(url, lang, options.thumbnail !== false);
    const warnings = [...info.warnings];

    if (!fetched.ok) {
      if (fetched.code === 'LOGIN_REQUIRED') return { ok: false, code: fetched.code, error: fetched.error };
      warnings.push(fetched.code);
      return { ok: true, media: info.media, transcript: null, warnings, images: [] };
    }

    if (fetched.artifacts.text !== '') this.cacheArtifacts(`${url}|${lang}`, fetched.artifacts);

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

  private pickLanguage(media: MediaInfo, requested?: string): string {
    const explicit = (requested ?? '').trim();
    if (explicit !== '') return explicit;
    // Prefer English when it exists, then a manual track, then auto captions.
    const manual = media.subtitleLanguages;
    const auto = media.automaticCaptionLanguages;
    const english = (codes: readonly string[]): string | undefined =>
      codes.find((code) => code === 'en') ?? codes.find((code) => code.startsWith('en'));
    return english(manual) ?? english(auto) ?? manual[0] ?? auto[0] ?? 'en';
  }

  private cacheArtifacts(key: string, artifacts: SubtitleArtifacts): void {
    this.transcriptCache.set(key, { at: Date.now(), artifacts });
    if (this.transcriptCache.size > 20) {
      const oldest = [...this.transcriptCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.transcriptCache.delete(oldest[0]);
    }
  }

  /**
   * Resolve the downloader binary, or the failure response when it is unusable.
   * The preview and artifacts paths both begin with the same guard.
   */
  private async binaryOrFailure(): Promise<
    | { readonly ok: true; readonly binary: MediaBinary }
    | { readonly ok: false; readonly code: string; readonly error: string }
  > {
    const binary = await this.resolveBinary();
    return isMediaBinary(binary)
      ? { ok: true, binary }
      : { ok: false, code: binary.code, error: binary.error };
  }

  private async artifactsFor(
    url: string,
    lang: string,
    includeThumbnail: boolean,
  ): Promise<
    | { readonly ok: true; readonly artifacts: SubtitleArtifacts; readonly images: MediaPreviewImage[] }
    | { readonly ok: false; readonly code: string; readonly error: string }
  > {
    const resolved = await this.binaryOrFailure();
    if (!resolved.ok) return resolved;

    const cookies = await this.cookieFileFor(url);
    const dir = path.join(
      this.rootDir,
      '.preview',
      `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    );

    try {
      const result = await fetchArtifacts(resolved.binary, url, dir, {
        lang,
        includeThumbnail,
        ...(cookies === null ? {} : { cookiesPath: cookies.path }),
      });
      if (!result.ok) return result;

      const images: MediaPreviewImage[] = [];
      for (const image of result.artifacts.images) {
        try {
          const stat = await fsp.stat(image.path);
          if (stat.size > 4_000_000) continue;
          const data = await fsp.readFile(image.path);
          images.push({ name: image.name, mimeType: image.mimeType, base64: data.toString('base64') });
        } catch {
          // A thumbnail that cannot be read should not fail the preview.
        }
      }

      return { ok: true, artifacts: result.artifacts, images };
    } finally {
      await cookies?.cleanup();
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** The shared prelude: normalized URL, media info and preferred caption language. */
  private async locateMedia(
    rawUrl: string,
    lang?: string,
  ): Promise<
    | { ok: false; code: string; error: string }
    | { ok: true; url: string; lang: string; info: Extract<MediaInfoResult, { ok: true }> }
  > {
    const info = await this.info(rawUrl);
    if (!info.ok) return { ok: false, code: info.code, error: info.error };
    return { ok: true, url: rawUrl.trim(), lang: this.pickLanguage(info.media, lang), info };
  }
}
