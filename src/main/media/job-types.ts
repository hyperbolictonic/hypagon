/**
 * The media job surface: what a job is, its progress, its files, and the options a
 * host passes when constructing the queue.
 *
 * Kept apart from the queue itself so the bridge and the deck can type a job without
 * importing process spawning.
 *
 * When to use: typing `media jobs`, or building a `MediaJobs` in the app and tests.
 */
import type { MediaBinary, MediaBinaryError } from './binaries.ts';

/** When to use: selecting the downloader mode (video or audio-only). */
export type MediaKind = 'video' | 'audio';
/** When to use: capping the selected format (best, 1080/720/480, worst). */
export type MediaQuality = 'best' | '1080' | '720' | '480' | 'worst';
/** When to use: reporting or observing a media job lifecycle state. */
export type MediaJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** When to use: describing one downloaded file (path, bytes, format note). */
export interface MediaJobFile {
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
}

/** When to use: reporting download progress (percent, speed, ETA) to the deck. */
export interface MediaProgress {
  readonly percent: number | null;
  readonly downloadedBytes: number | null;
  readonly totalBytes: number | null;
  readonly speedBytesPerSecond: number | null;
  readonly etaSeconds: number | null;
  readonly stage: 'starting' | 'downloading' | 'merging' | 'postprocessing' | 'finalising';
}

/** When to use: queueing, cancelling or inspecting one media job. */
export interface MediaJob {
  readonly id: string;
  readonly url: string;
  readonly kind: MediaKind;
  readonly quality: MediaQuality;
  state: MediaJobState;
  title: string | null;
  progress: MediaProgress | null;
  files: MediaJobFile[];
  error: { readonly code: string; readonly message: string } | null;
  readonly createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** When to use: starting a media job from a URL plus kind/quality options. */
export interface MediaJobInput {
  readonly url: string;
  readonly kind?: MediaKind;
  readonly quality?: MediaQuality;
}

/** When to use: constructing the job queue (binary paths, ffmpeg) in the app or tests. */
export interface MediaJobsOptions {
  readonly rootDir: string;
  readonly resolveBinary: () => Promise<MediaBinary | MediaBinaryError>;
  readonly maxConcurrent?: number;
  /** One-run cookie file for a URL, when the session setting is on. */
  readonly cookieFileFor?: (url: string) => Promise<{ path: string; cleanup(): Promise<void> } | null>;
  /** Called once when a job fails because the site wants a signed-in session. */
  readonly onLoginRequired?: (job: MediaJob) => void;
  /** Base folder for job output. Defaults to `rootDir`. */
  readonly outputDir?: () => string;
  /** Resolved ffmpeg, so the selector can merge and paths can be passed explicitly. */
  readonly resolveFfmpeg?: () => Promise<{ available: boolean; path: string | null }>;
}
