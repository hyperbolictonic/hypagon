/**
 * Timelapse recorder — main-process side.
 *
 * The capture and encoding happen in the renderer (desktopCapturer streams and WebCodecs only
 * exist there); this service owns configuration, the window source, the file, and the registry of
 * recordings. It also exposes the finished path, which is the point of the feature: an agent can
 * take a timelapse and then type that absolute path into a file-upload field.
 *
 * Frames are captured every `intervalMs` and stamped as if they were `fps` apart, so a 10-minute
 * session becomes a ~20-second video at the default 1 fps / 30 fps settings. MediaRecorder cannot
 * do that (it always stamps in real time), which is why the renderer uses VideoEncoder directly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import { listRecordingFiles, recordingFilename, writeRecordingFile, type RecordingResult } from './files.js';

export type { RecordingResult } from './files.js';

/** When to use: reading or patching the recording settings (enabled, tools switch, output directory). */
export interface RecordingConfig {
  /** Whether the recorder is available at all (the REC button and the tools). */
  enabled: boolean;
  /**
   * Human-only master switch for the MCP recording tools. Not exposed to any tool or HTTP
   * route that an agent can reach: it is only written from the Settings panel over IPC.
   */
  toolsEnabled: boolean;
  /** Absolute directory for finished files. */
  outputDir: string;
  /** Real milliseconds between captured frames. */
  intervalMs: number;
  /** Playback frame rate of the timelapse. */
  fps: number;
  /** Downscale width (height follows the window aspect). */
  maxWidth: number;
  /** Video bitrate in bits/second. */
  bitrate: number;
}

/** When to use: rendering the deck recorder or answering `GET /recording/status`. */
export interface RecordingStatus {
  recording: boolean;
  enabled: boolean;
  /** Human-only switch; false means the recording tools are hidden and refused. */
  toolsEnabled: boolean;
  filename?: string;
  startedAt?: number;
  frames?: number;
  lastResult?: RecordingResult;
  error?: string;
}

const DEFAULT_CONFIG = (): RecordingConfig => ({
  enabled: true,
  toolsEnabled: true,
  outputDir: path.join(app.getPath('userData'), 'recordings'),
  intervalMs: 1000,
  fps: 30,
  maxWidth: 1280,
  bitrate: 3_000_000,
});

function configPath(): string {
  return path.join(app.getPath('userData'), 'recording.json');
}

let mainWindow: BrowserWindow | null = null;
let config: RecordingConfig = DEFAULT_CONFIG();
let status: RecordingStatus = { recording: false, enabled: true, toolsEnabled: true };
let statusListener: ((s: RecordingStatus) => void) | null = null;
let pending: { filename: string; startedAt: number; resolve: (r: RecordingResult) => void; reject: (e: Error) => void } | null = null;
let pendingStart: {
  resolve: () => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
} | null = null;
let startBarrier: Promise<void> | null = null;

/** When to use: the deck subscribes to recorder state changes (start/stop/failure). */
export function onRecordingStatus(cb: (s: RecordingStatus) => void): void {
  statusListener = cb;
}

function setStatus(next: Partial<RecordingStatus>): void {
  status = { ...status, ...next };
  try {
    statusListener?.(getRecordingStatus());
  } catch {
    // A UI listener must never break the recorder.
  }
}

/** When to use: wiring the window the recorder captures; called once during app bootstrap. */
export function setRecordingWindow(win: BrowserWindow): void {
  mainWindow = win;
}

/** When to use: restoring persisted recording settings at startup. */
export function loadRecordingConfig(): RecordingConfig {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    config = { ...DEFAULT_CONFIG(), ...stored };
  } catch {
    config = DEFAULT_CONFIG();
  }
  status.enabled = config.enabled;
  status.toolsEnabled = config.toolsEnabled;
  return config;
}

/** When to use: reading the effective recording settings where a tool is about to run. */
export function getRecordingConfig(): RecordingConfig {
  return { ...config };
}

/** When to use: applying a settings patch from IPC; returns the normalised config. */
export function saveRecordingConfig(input: Partial<RecordingConfig>): RecordingConfig {
  const next: RecordingConfig = {
    ...config,
    ...input,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : config.enabled,
    toolsEnabled: typeof input.toolsEnabled === 'boolean' ? input.toolsEnabled : config.toolsEnabled,
    intervalMs: clamp(Number(input.intervalMs ?? config.intervalMs), 200, 60_000),
    fps: clamp(Number(input.fps ?? config.fps), 5, 60),
    maxWidth: clamp(Number(input.maxWidth ?? config.maxWidth), 480, 1920),
    bitrate: clamp(Number(input.bitrate ?? config.bitrate), 500_000, 20_000_000),
  };
  if (typeof next.outputDir === 'string' && next.outputDir.trim()) {
    next.outputDir = path.resolve(next.outputDir.trim());
  } else {
    next.outputDir = DEFAULT_CONFIG().outputDir;
  }
  config = next;
  status.enabled = next.enabled;
  status.toolsEnabled = next.toolsEnabled;
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2) + '\n', 'utf8');
    fs.mkdirSync(next.outputDir, { recursive: true });
  } catch {
    // Keep the in-memory config even if the file cannot be written.
  }
  return { ...config };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** When to use: answering health, the deck and the tool gate with the current recorder state. */
export function getRecordingStatus(): RecordingStatus {
  return { ...status };
}

/** When to use: the human chooses a new capture folder from Settings → Recording. */
export async function pickRecordingDir(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Choose where timelapses are saved',
    defaultPath: config.outputDir,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
}

/** Start recording the Cyberdeck window. Resolves when the renderer has the stream running. */
export async function startRecording(name?: string): Promise<{ filename: string; config: RecordingConfig }> {
  if (!config.enabled) throw new Error('Recording is disabled in Settings.');
  if (status.recording) throw new Error('Already recording.');
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('No window to record.');

  fs.mkdirSync(config.outputDir, { recursive: true });
  const filename = recordingFilename(name);
  const startedAt = Date.now();

  const sourceId = mainWindow.getMediaSourceId();

  // Do not report success until the renderer has a live encoder. `record_start` becomes an
  // honest "the recording is running" signal, and a stop racing ahead of capture is impossible.
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingStart) {
        pendingStart = null;
        startBarrier = null;
        failRecording('Timed out starting the recording.');
      }
      reject(new Error('Timed out starting the recording.'));
    }, 15_000);
    timer.unref?.();
    pendingStart = { resolve, reject, timer };
  });
  startBarrier = ready.catch(() => undefined);

  mainWindow.webContents.send('recording:begin', {
    sourceId,
    filename,
    intervalMs: config.intervalMs,
    fps: config.fps,
    maxWidth: config.maxWidth,
    bitrate: config.bitrate,
  });

  setStatus({ recording: true, enabled: config.enabled, filename, startedAt, frames: 0, error: undefined });

  try {
    await ready;
  } finally {
    startBarrier = null;
  }
  return { filename, config: { ...config } };
}

/** Called by the renderer once the stream and encoder are actually running. */
export function readyRecording(): void {
  const start = pendingStart;
  if (!start) return;
  pendingStart = null;
  clearTimeout(start.timer);
  start.resolve();
}

/** Ask the renderer to finalise; the file is written when it calls `saveRecording`. */
export async function stopRecording(): Promise<RecordingResult> {
  // A stop can arrive while the renderer is still opening the capture stream. Wait for that
  // handshake instead of failing (and instead of leaving an orphaned recording running).
  if (startBarrier) {
    await startBarrier;
  }
  if (!status.recording) {
    if (status.lastResult) return status.lastResult;
    throw new Error(status.error || 'Not recording.');
  }
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Window disappeared.');

  const startedAt = status.startedAt || Date.now();
  const filename = status.filename || recordingFilename();

  return new Promise<RecordingResult>((resolve, reject) => {
    pending = { filename, startedAt, resolve, reject };
    mainWindow!.webContents.send('recording:stop');
    setTimeout(() => {
      if (pending && pending.filename === filename) {
        pending = null;
        setStatus({ recording: false, error: 'timed out finalising the recording' });
        reject(new Error('Timed out finalising the recording.'));
      }
    }, 30_000).unref?.();
  });
}

/** Called from the renderer with the finished WebM bytes. */
export function saveRecording(buffer: ArrayBuffer, frames: number): RecordingResult {
  const active = pending;
  if (!active) throw new Error('No recording to save.');
  pending = null;

  const result = writeRecordingFile({
    outputDir: config.outputDir,
    filename: active.filename,
    startedAt: active.startedAt,
    buffer,
    frames,
    fps: config.fps,
  });
  setStatus({ recording: false, frames, lastResult: result, error: undefined });
  active.resolve(result);
  return result;
}

/** When to use: surfacing a capture failure to the deck and clearing the in-progress state. */
export function failRecording(message: string): void {
  setStatus({ recording: false, error: message });
  const start = pendingStart;
  pendingStart = null;
  if (start) {
    clearTimeout(start.timer);
    start.reject(new Error(message));
  }
  const active = pending;
  pending = null;
  active?.reject(new Error(message));
}

/** Finished recordings, newest first. Paths are absolute and ready for a file-upload field. */
export function listRecordings(limit = 50): Array<{ path: string; filename: string; bytes: number; modified: number }> {
  return listRecordingFiles(config.outputDir, limit);
}
