/**
 * Media reads for the agent surface.
 *
 * `info` asks yt-dlp for metadata without downloading anything. Execution lives
 * in the main process: the binary is local, the runtime is Electron itself, and
 * later slices add a job queue and the browser-session cookie handoff here.
 *
 * The downloader is never given agent-supplied flags. Every argument is built in
 * this file, and `--ignore-config` keeps a stray yt-dlp config file from adding
 * `--exec` or anything else.
 *
 * Metadata runs live in `media/media-info.ts` and the caption/thumbnail path in
 * `media/media-artifacts.ts`; this service keeps policy, caching and the settings
 * handshake.
 */

import path from 'node:path';
import { app } from 'electron';

import { isMediaBinary, ensureYtDlp, readYtDlpVersion, writableYtDlpPath, type MediaBinary, type MediaBinaryError } from './binaries.ts';
import { writeCookieFile } from './cookies.ts';
import { detectFfmpeg, installManagedFfmpeg, type FfmpegInfo } from './ffmpeg.ts';
import { MediaJobs, type MediaJob, type MediaJobInput, type MediaKind, type MediaQuality } from './jobs.ts';
import { ytdlpRuntimeOptions } from './platform.ts';
import { MediaSettingsStore } from './settings.ts';
import { MediaUpdater, type MediaUpdaterOptions } from './updater.ts';
import { fetchInfo } from './media-info.ts';
import { TranscriptCache } from './media-artifacts.ts';
import { MediaReader } from './media-read.ts';
import type { MediaSettings, MediaSettingsSnapshot, MediaUpdaterState } from '../../shared/media.ts';
import { assertSafeUrl, WrapSecurityError } from '../wrap/security.ts';
import type {
  MediaDownloadResult,
  MediaInfoResult,
  MediaPreviewResult,
  MediaStatus,
  MediaTranscriptResult,
} from './media-types.ts';

export type {
  MediaDownloadResult,
  MediaInfo,
  MediaInfoResult,
  MediaPreviewImage,
  MediaPreviewResult,
  MediaRuntimeStatus,
  MediaServiceError,
  MediaStatus,
  MediaTranscriptResult,
} from './media-types.js';

const MEDIA_KINDS: readonly MediaKind[] = ['video', 'audio'];
const MEDIA_QUALITIES: readonly MediaQuality[] = ['best', '1080', '720', '480', 'worst'];

/** When to use: starting media jobs from the bridge, or wiring the media tools in the app. */
export class MediaService {
  private binaryPromise: Promise<MediaBinary | MediaBinaryError> | null = null;
  private readonly rootDir: string;
  private readonly settingsStore: MediaSettingsStore;
  private readonly notify?: (notice: { title: string; message: string }) => void;
  private lastLoginNoticeAt = 0;
  private ffmpegCache: { at: number; info: FfmpegInfo } | null = null;
  private ffmpegInstalling = false;
  private readonly transcriptCache = new TranscriptCache();
  private readonly reader: MediaReader;
  readonly jobs: MediaJobs;
  readonly updater: MediaUpdater;

  constructor(options: { rootDir?: string; notify?: (notice: { title: string; message: string }) => void } = {}) {
    this.rootDir = options.rootDir ?? path.join(app.getPath('userData'), 'media');
    this.notify = options.notify;
    this.settingsStore = new MediaSettingsStore(path.join(this.rootDir, 'settings.json'));
    this.jobs = new MediaJobs({
      rootDir: this.rootDir,
      resolveBinary: () => this.resolveBinary(),
      cookieFileFor: (url) => this.cookieFileFor(url),
      onLoginRequired: () => this.notifyLoginRequired(),
      outputDir: () => this.settingsStore.load().outputDir || this.rootDir,
      resolveFfmpeg: () => this.ffmpegInfo(),
    });
    this.reader = new MediaReader({
      rootDir: this.rootDir,
      cache: this.transcriptCache,
      info: (rawUrl) => this.info(rawUrl),
      resolveBinary: () => this.resolveBinary(),
      cookiesFor: (url) => this.cookieFileFor(url),
    });
    this.updater = new MediaUpdater({
      binaryPath: writableYtDlpPath,
      readVersion: readYtDlpVersion,
      settings: () => this.settingsStore.load(),
      hasRunningJobs: () => this.jobs.counts().running > 0,
      onUpdated: () => this.invalidateBinary(),
    });
  }

  /** A one-run cookie file, only when the human enabled the browser session. */
  private async cookieFileFor(url: string): Promise<{ path: string; cleanup(): Promise<void> } | null> {
    if (!this.settingsStore.load().useSessionCookies) return null;
    try {
      return await writeCookieFile(url, path.join(this.rootDir, '.cookies'));
    } catch {
      // A cookie-store failure must not fail the request; it may still work anonymously.
      return null;
    }
  }

  private notifyLoginRequired(): void {
    const now = Date.now();
    if (now - this.lastLoginNoticeAt < 60_000) return;
    this.lastLoginNoticeAt = now;
    const enabled = this.settingsStore.load().useSessionCookies;
    const message = enabled
      ? 'A media request was refused for authentication even with the browser session. Sign in again in the browser, then retry.'
      : 'A media request needs a signed-in session. Enable Settings → Media → "Use browser session", then retry.';
    this.notify?.({ title: 'Media needs your browser session', message });
  }

  /** Resolve once per process; the updater will invalidate this when it installs. */
  resolveBinary(): Promise<MediaBinary | MediaBinaryError> {
    this.binaryPromise ??= ensureYtDlp();
    return this.binaryPromise;
  }

  invalidateBinary(): void {
    this.binaryPromise = null;
  }

  shutdown(): void {
    this.updater.stop();
    this.jobs.shutdown();
  }

  startUpdater(): void {
    this.updater.start();
  }

  mediaSettings(): MediaSettings {
    return this.settingsStore.load();
  }

  saveMediaSettings(patch: unknown): MediaSettingsSnapshot {
    const settings = this.settingsStore.save(patch);
    this.ffmpegCache = null;
    return { settings, updater: this.updater.state() };
  }

  settingsSnapshot(): MediaSettingsSnapshot {
    return { settings: this.settingsStore.load(), updater: this.updater.state() };
  }

  checkForUpdate(force = true): Promise<MediaUpdaterState> {
    return this.updater.check(force);
  }

  /** ffmpeg for the current settings. Cached briefly so status polls stay cheap. */
  async ffmpegInfo(force = false): Promise<FfmpegInfo> {
    const now = Date.now();
    if (!force && this.ffmpegCache !== null && now - this.ffmpegCache.at < 30_000) {
      return { ...this.ffmpegCache.info, installing: this.ffmpegInstalling };
    }
    const info = await detectFfmpeg(this.settingsStore.load(), this.rootDir, this.ffmpegInstalling);
    this.ffmpegCache = { at: now, info };
    return info;
  }

  async installFfmpeg(): Promise<FfmpegInfo> {
    this.ffmpegInstalling = true;
    this.ffmpegCache = null;
    try {
      return await installManagedFfmpeg(this.settingsStore.load(), this.rootDir);
    } finally {
      this.ffmpegInstalling = false;
      this.ffmpegCache = null;
    }
  }

  async status(): Promise<MediaStatus> {
    const binary = await this.resolveBinary();
    const runtime = ytdlpRuntimeOptions();
    const available = isMediaBinary(binary);
    const ffmpeg = await this.ffmpegInfo();
    return {
      binary: {
        available,
        version: available ? binary.version : null,
        source: available ? binary.source : null,
      },
      runtime: { kind: runtime.kind, node: runtime.node },
      capabilities: {
        info: available,
        download: available,
        merge: ffmpeg.available,
        transcode: ffmpeg.available,
      },
      jobs: this.jobs.counts(),
      cookies: { useSession: this.settingsStore.load().useSessionCookies },
      ffmpeg,
      updater: this.updater.state(),
    };
  }

  transcript(
    rawUrl: string,
    options: { lang?: string; maxChars?: number; cursor?: number; index?: boolean } = {},
  ): Promise<MediaTranscriptResult> {
    return this.reader.transcript(rawUrl, options);
  }

  preview(
    rawUrl: string,
    options?: { lang?: string; maxChars?: number; thumbnail?: boolean },
  ): Promise<MediaPreviewResult> {
    return this.reader.preview(rawUrl, options ?? {});
  }

  async download(input: MediaJobInput): Promise<MediaDownloadResult> {
    const url = typeof input?.url === 'string' ? input.url.trim() : '';
    if (url === '') return { ok: false, code: 'BAD_REQUEST', error: 'url is required' };

    try {
      await assertSafeUrl(url);
    } catch (error) {
      if (error instanceof WrapSecurityError) return { ok: false, code: error.code, error: error.message };
      return { ok: false, code: 'INVALID_URL', error: error instanceof Error ? error.message : String(error) };
    }

    const binary = await this.resolveBinary();
    if (!isMediaBinary(binary)) return { ok: false, code: binary.code, error: binary.error };

    const kind = MEDIA_KINDS.includes(input.kind as MediaKind) ? (input.kind as MediaKind) : 'video';
    const quality = MEDIA_QUALITIES.includes(input.quality as MediaQuality)
      ? (input.quality as MediaQuality)
      : 'best';

    return { ok: true, job: this.jobs.enqueue({ url, kind, quality }) };
  }

  cancel(id: string): { ok: boolean; cancelled: boolean } {
    return { ok: true, cancelled: this.jobs.cancel(id) };
  }

  /** Completed jobs with their files, newest first. */
  library(): MediaJob[] {
    return this.jobs.list().filter((job) => job.state === 'completed');
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

    const binary = await this.resolveBinary();
    if (!isMediaBinary(binary)) return { ok: false, code: binary.code, error: binary.error };

    const cookies = await this.cookieFileFor(url);
    try {
      return await fetchInfo({
        url,
        binary,
        cookiesPath: cookies === null ? null : cookies.path,
        onLoginRequired: () => this.notifyLoginRequired(),
      });
    } finally {
      await cookies?.cleanup();
    }
  }
}
