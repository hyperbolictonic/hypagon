/**
 * The media surface's result and status shapes.
 *
 * Why a module: the reader (info/transcript/preview), the settings panel, the
 * routes and the MCP catalog all describe the same answers. Keeping them beside
 * the facade would make every helper import the class it is composed into.
 */
import type { FfmpegInfo } from './ffmpeg.ts';
import type { MediaJob } from './job-types.ts';
import type { MediaBinaryError } from './binaries.ts';
import type { MediaSettingsSnapshot, MediaUpdaterState } from '../../shared/media.ts';

/** When to use: naming the runtime a media call will use. */
export interface MediaRuntimeStatus {
  readonly kind: 'electron-node' | 'none';
  readonly node: string | null;
}

/** When to use: `/media/status` and the Settings → Media panel. */
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

/** When to use: reading one video's metadata without downloading it. */
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

/** When to use: the `media_info` answer. */
export type MediaInfoResult =
  | {
      readonly ok: true;
      readonly media: MediaInfo;
      readonly runtime: MediaRuntimeStatus;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly code: string; readonly error: string };

/** A typed binary-resolution failure, re-exported for route typing. */
export type MediaServiceError = MediaBinaryError;

/** When to use: the `media_transcript` answer — captions as paged text. */
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

/** One poster/thumbnail image, already encoded for the MCP image content block. */
export interface MediaPreviewImage {
  readonly name: string;
  readonly mimeType: string;
  readonly base64: string;
}

/** When to use: the `media_preview` answer — metadata, an excerpt and images. */
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

/** When to use: the `media_download` answer — the queued job, or why it was refused. */
export type MediaDownloadResult =
  | { readonly ok: true; readonly job: MediaJob }
  | { readonly ok: false; readonly code: string; readonly error: string };

/** The settings snapshot and updater state the media IPC returns. */
export type { MediaSettingsSnapshot, MediaUpdaterState };
