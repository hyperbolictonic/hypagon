/**
 * The media-download job shapes.
 *
 * Why a module: the queue (`jobs.ts`), the yt-dlp argument builder
 * (`job-format.ts`), the process plumbing (`job-process.ts`) and the history
 * store all speak these types. Keeping them in `jobs.ts` would make every helper
 * import the class that composes it.
 */

/** What a job downloads: a video file, or the audio track only. */
export type MediaKind = 'video' | 'audio';
/** The requested ceiling; `best`/`worst` keep yt-dlp's own ranking. */
export type MediaQuality = 'best' | '1080' | '720' | '480' | 'worst';
/** Where a job is in its lifecycle. */
export type MediaJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** When to use: one finished file of a download job. */
export interface MediaJobFile {
  readonly name: string;
  readonly path: string;
  readonly bytes: number;
}

/** When to use: the parsed `--newline` progress of a running job. */
export interface MediaProgress {
  readonly percent: number | null;
  readonly downloadedBytes: number | null;
  readonly totalBytes: number | null;
  readonly speedBytesPerSecond: number | null;
  readonly etaSeconds: number | null;
  readonly stage: 'starting' | 'downloading' | 'merging' | 'postprocessing' | 'finalising';
}

/** When to use: `media jobs` — one queued, running or finished download. */
export interface MediaJob {
  readonly id: string;
  readonly url: string;
  readonly kind: MediaKind;
  readonly quality: MediaQuality;
  state: MediaJobState;
  title: string | null;
  progress: MediaProgress | null;
  files: MediaJobFile[];
  error: { readonly code: string; message: string } | null;
  readonly createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** When to use: the enqueue call the bridge makes. */
export interface MediaJobInput {
  readonly url: string;
  readonly kind?: MediaKind;
  readonly quality?: MediaQuality;
}
