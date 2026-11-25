/**
 * Media reads for the agent surface.
 *
 * `info` asks yt-dlp for metadata without downloading anything. Execution lives
 * in the main process: the binary is local, the runtime is Electron itself, and
 * the job queue plus the browser-session cookie handoff live here.
 *
 * The downloader is never given agent-supplied flags. Every argument is built in
 * `media-reader.ts` / `job-format.ts`, and `--ignore-config` keeps a stray
 * yt-dlp config file from adding `--exec` or anything else.
 *
 * Why this file is small: the settings/ffmpeg/updater panel is
 * `media-settings.ts`, the metadata/transcript/preview paths are
 * `media-reader.ts`, the queue is `jobs.ts`, and the payload mapping is
 * `info-payload.ts`. This class is the lifecycle facade the bridge talks to.
 */

import path from 'node:path';
import { app } from 'electron';

import { ensureYtDlp, isMediaBinary, readYtDlpVersion, writableYtDlpPath, type MediaBinary, type MediaBinaryError } from './binaries.ts';
import { writeCookieFile } from './cookies.ts';
import { MediaJobs, type MediaJob, type MediaJobInput, type MediaKind, type MediaQuality } from './jobs.ts';
import { MediaReader } from './media-reader.ts';
import { MediaSettingsPanel } from './media-settings.ts';
import { MediaSettingsStore } from './settings.ts';
import { MediaUpdater } from './updater.ts';
import { ytdlpRuntimeOptions } from './platform.ts';
import { assertSafeUrl, WrapSecurityError } from '../wrap/security.ts';
import type { MediaDownloadResult, MediaStatus } from './media-types.ts';

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
} from './media-types.ts';

/** When to use: the boot — `rootDir` defaults to `<userData>/media`. */
export interface MediaServiceOptions {
  rootDir?: string;
  notify?: (notice: { title: string; message: string }) => void;
}

const MEDIA_KINDS: readonly MediaKind[] = ['video', 'audio'];
const MEDIA_QUALITIES: readonly MediaQuality[] = ['best', '1080', '720', '480', 'worst'];

export class MediaService {
  private binaryPromise: Promise<MediaBinary | MediaBinaryError> | null = null;
  private readonly rootDir: string;
  private readonly notify?: (notice: { title: string; message: string }) => void;
  private lastLoginNoticeAt = 0;
  private readonly cookieFileFor: (url: string) => Promise<{ path: string; cleanup(): Promise<void> } | null>;
  private readonly notifyLoginRequired: () => void;
  readonly settings: MediaSettingsPanel;
  readonly reader: MediaReader;
  readonly jobs: MediaJobs;
  readonly updater: MediaUpdater;

  constructor(options: MediaServiceOptions = {}) {
    this.rootDir = options.rootDir ?? path.join(app.getPath('userData'), 'media');
    this.notify = options.notify;

    const store = new MediaSettingsStore(path.join(this.rootDir, 'settings.json'));
    this.settings = new MediaSettingsPanel({ rootDir: this.rootDir, store, updater: () => this.updater });

    // One-run cookie file, only when the human enabled the browser session.
    this.cookieFileFor = async (url) => {
      if (!store.load().useSessionCookies) return null;
      try {
        return await writeCookieFile(url, path.join(this.rootDir, '.cookies'));
      } catch {
        // A cookie-store failure must not fail the request; it may still work anonymously.
        return null;
      }
    };

    // Rate-limited so a burst of refused requests raises one hand-off, not ten.
    this.notifyLoginRequired = () => {
      const now = Date.now();
      if (now - this.lastLoginNoticeAt < 60_000) return;
      this.lastLoginNoticeAt = now;
      const enabled = store.load().useSessionCookies;
      const message = enabled
        ? 'A media request was refused for authentication even with the browser session. Sign in again in the browser, then retry.'
        : 'A media request needs a signed-in session. Enable Settings → Media → "Use browser session", then retry.';
      this.notify?.({ title: 'Media needs your browser session', message });
    };

    this.reader = new MediaReader({
      rootDir: this.rootDir,
      resolveBinary: () => this.resolveBinary(),
      cookieFileFor: (url) => this.cookieFileFor(url),
      onLoginRequired: () => this.notifyLoginRequired(),
    });

    this.jobs = new MediaJobs({
      rootDir: this.rootDir,
      resolveBinary: () => this.resolveBinary(),
      cookieFileFor: (url) => this.cookieFileFor(url),
      onLoginRequired: () => this.notifyLoginRequired(),
      outputDir: () => store.load().outputDir || this.rootDir,
      resolveFfmpeg: () => this.settings.ffmpeg(),
    });

    this.updater = new MediaUpdater({
      binaryPath: writableYtDlpPath,
      readVersion: readYtDlpVersion,
      settings: () => store.load(),
      hasRunningJobs: () => this.jobs.counts().running > 0,
      onUpdated: () => this.invalidateBinary(),
    });
  }

  /** Resolve once per process; the updater will invalidate this when it installs. */
  resolveBinary(): Promise<MediaBinary | MediaBinaryError> {
    this.binaryPromise ??= ensureYtDlp();
    return this.binaryPromise;
  }

  invalidateBinary(): void {
    this.binaryPromise = null;
  }

  async status(): Promise<MediaStatus> {
    const binary = await this.resolveBinary();
    const runtime = ytdlpRuntimeOptions();
    const available = isMediaBinary(binary);
    const ffmpeg = await this.settings.ffmpeg();
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
      cookies: { useSession: this.settings.settings().useSessionCookies },
      ffmpeg,
      updater: this.updater.state(),
    };
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

  shutdown(): void {
    this.updater.stop();
    this.jobs.shutdown();
  }

  startUpdater(): void {
    this.updater.start();
  }
}
