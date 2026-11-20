/**
 * The media service's published surface: status, metadata, transcript, preview and
 * download results.
 *
 * Kept apart from the service so the bridge and the deck can type a response without
 * importing yt-dlp, ffmpeg or the job queue.
 *
 * When to use: typing any `media` route response or the status panel.
 */
import type { FfmpegInfo } from './ffmpeg.ts';
import type { MediaJob } from './jobs.ts';
import type { MediaBinaryError } from './binaries.ts';
import type { MediaUpdaterState } from '../../shared/media.ts';

/** When to use: reporting only the media runtime fields on the health payload. */
export interface MediaRuntimeStatus {
  readonly kind: 'electron-node' | 'none';
  readonly node: string | null;
}

/** When to use: rendering the deck media panel or `GET /media/status`. */
export interface MediaStatus {
  readonly binary: {
    readonly available: boolean;
    readonly version: string | null;
    readonly source: 'bundled' | 'user-data' | null;
  };
  readonly runtime: MediaRuntimeStatus;
  readonly capabilities: {
    readonly info: boolean;
    readonly download: boolean;
    readonly merge: boolean;
    readonly transcode: boolean;
  };
  readonly jobs: {
    readonly queued: number;
    readonly running: number;
    readonly completed: number;
    readonly failed: number;
    readonly cancelled: number;
  };
  readonly cookies: {
    readonly useSession: boolean;
  };
  readonly ffmpeg: FfmpegInfo;
  readonly updater: MediaUpdaterState;
}

/** When to use: answering `GET /media/info` with a resolved URL title/duration/formats. */
export interface MediaInfo {
  readonly id: string | null;
  readonly title: string | null;
  readonly durationSeconds: number | null;
  readonly uploader: string | null;
  readonly extractor: string | null;
  readonly webpageUrl: string | null;
  readonly thumbnail: string | null;
  readonly isLive: boolean;
  readonly ageLimit: number | null;
  readonly formatCount: number;
  readonly maxHeight: number | null;
  readonly audioOnly: boolean;
  readonly subtitleLanguages: readonly string[];
  readonly automaticCaptionLanguages: readonly string[];
}

/** When to use: returning metadata (or the refusal) from `POST /media/info`. */
export type MediaInfoResult =
  | {
      readonly ok: true;
      readonly media: MediaInfo;
      readonly runtime: MediaRuntimeStatus;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly code: string; readonly error: string };

/** When to use: carrying a binary/job failure with its code up to the route. */
export type MediaServiceError = MediaBinaryError;

/** When to use: returning a transcript or subtitle document from `POST /media/transcript`. */
export type MediaTranscriptResult =
  | {
      readonly ok: true;
      readonly language: string;
      readonly automatic: boolean;
      readonly text: string;
      readonly chars: number;
      readonly totalChars: number;
      readonly truncated: boolean;
      readonly nextCursor: number | null;
      readonly availableLanguages: readonly string[];
      readonly indexed?: { readonly chunks: number; readonly error?: string };
    }
  | { readonly ok: false; readonly code: string; readonly error: string };

/** When to use: attaching a generated thumbnail to `POST /media/preview`. */
export interface MediaPreviewImage {
  readonly name: string;
  readonly mimeType: string;
  readonly base64: string;
}

/** When to use: returning preview frames (or the refusal) from `POST /media/preview`. */
export type MediaPreviewResult =
  | {
      readonly ok: true;
      readonly media: MediaInfo;
      readonly transcript: {
        readonly language: string;
        readonly automatic: boolean;
        readonly text: string;
        readonly chars: number;
        readonly totalChars: number;
        readonly truncated: boolean;
      } | null;
      readonly warnings: readonly string[];
      readonly images: readonly MediaPreviewImage[];
    }
  | { readonly ok: false; readonly code: string; readonly error: string };

/** When to use: returning a finished download (path, bytes, title) from `POST /media/download`. */
export type MediaDownloadResult =
  | { readonly ok: true; readonly job: MediaJob }
  | { readonly ok: false; readonly code: string; readonly error: string };
