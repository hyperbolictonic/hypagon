/**
 * The Settings → Media panel: the settings file, the ffmpeg probe with its
 * short cache, and the updater's public face.
 *
 * Why a module: `MediaService` had ten methods that only read or wrote settings
 * or asked ffmpeg/updater for a state. The panel owns that state and the two
 * caches, so the facade keeps the lifecycle and the reading paths.
 */
import { detectFfmpeg, installManagedFfmpeg, type FfmpegInfo } from './ffmpeg.ts';
import type { MediaSettingsStore } from './settings.ts';
import type { MediaUpdater } from './updater.ts';
import type { MediaSettings, MediaSettingsSnapshot } from '../../shared/media.ts';
import type { MediaUpdaterState } from '../../shared/media.ts';

/** When to use: constructing the panel — the store and updater come from the facade. */
export interface MediaSettingsDeps {
  rootDir: string;
  store: MediaSettingsStore;
  updater: () => MediaUpdater;
}

/** When to use: the Settings → Media panel and the media status poll. */
export class MediaSettingsPanel {
  private readonly rootDir: string;
  private readonly store: MediaSettingsStore;
  private readonly updater: () => MediaUpdater;
  private ffmpegCache: { at: number; info: FfmpegInfo } | null = null;
  private ffmpegInstalling = false;

  constructor(deps: MediaSettingsDeps) {
    this.rootDir = deps.rootDir;
    this.store = deps.store;
    this.updater = deps.updater;
  }

  /** The settings every other media path reads (cookies, output dir, quality). */
  settings(): MediaSettings {
    return this.store.load();
  }

  save(patch: unknown): MediaSettingsSnapshot {
    const settings = this.store.save(patch);
    this.ffmpegCache = null;
    return { settings, updater: this.updater().state() };
  }

  snapshot(): MediaSettingsSnapshot {
    return { settings: this.store.load(), updater: this.updater().state() };
  }

  checkForUpdate(force = true): Promise<MediaUpdaterState> {
    return this.updater().check(force);
  }

  /** ffmpeg for the current settings. Cached briefly so status polls stay cheap. */
  async ffmpeg(force = false): Promise<FfmpegInfo> {
    const now = Date.now();
    if (!force && this.ffmpegCache !== null && now - this.ffmpegCache.at < 30_000) {
      return { ...this.ffmpegCache.info, installing: this.ffmpegInstalling };
    }
    const info = await detectFfmpeg(this.store.load(), this.rootDir, this.ffmpegInstalling);
    this.ffmpegCache = { at: now, info };
    return info;
  }

  async installFfmpeg(): Promise<FfmpegInfo> {
    this.ffmpegInstalling = true;
    this.ffmpegCache = null;
    try {
      return await installManagedFfmpeg(this.store.load(), this.rootDir);
    } finally {
      this.ffmpegInstalling = false;
      this.ffmpegCache = null;
    }
  }
}
