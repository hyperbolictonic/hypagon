/**
 * Downloads
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const DOWNLOADS_TOOLS: ToolCatalogItem[] = [
  {
    name: 'list_downloads',
    description: 'Returns a list of all files downloaded into data/downloads/, including size and status.',
    parameters: {},
    endpoint: '/downloads',
    method: 'GET',
    format: (data) => {
      const dls = Array.isArray(data.downloads) ? data.downloads : [];
      if (dls.length === 0) return 'No downloaded files found in data/downloads/.';
      const lines = dls.map((d: any) => {
        const sizeKb = d.size ? `${Math.round(d.size / 1024)}KB` : 'unknown size';
        const status = d.state || d.status || 'completed';
        return `- ${d.filename || d.name} (${sizeKb}, ${status}) - path: ${d.path || d.filename}`;
      });
      return `### Downloaded Files (${dls.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'media_preview',
    description:
      'Previews a video without downloading it: metadata, an excerpt of the transcript, and the poster image. Use it to decide whether a full media download is worth committing to.',
    parameters: {
      url: z.string().describe('Video or audio page URL'),
      lang: z.string().optional().describe('Subtitle language code (default: first available, usually en)'),
      max_chars: z.coerce.number().optional().default(1200).describe('Transcript excerpt length (200-8000)'),
      thumbnail: z.coerce.boolean().optional().default(true).describe('Include the poster image'),
    },
    endpoint: '/media/preview',
    payload: (args) => ({
      url: args?.url,
      lang: args?.lang,
      maxChars: args?.max_chars,
      thumbnail: args?.thumbnail !== false,
    }),
    format: (data) => {
      if (!data?.media) return JSON.stringify(data, null, 2);
      const media = data.media;
      const lines = [`### ${media.title ?? media.id ?? 'Untitled'}`];
      const meta = [
        media.durationSeconds ? `${Math.floor(media.durationSeconds / 60)}:${String(media.durationSeconds % 60).padStart(2, '0')}` : null,
        media.uploader,
        media.extractor,
        media.isLive ? 'live' : null,
      ].filter(Boolean);
      if (meta.length > 0) lines.push(meta.join(' · '));
      if (media.subtitleLanguages?.length) lines.push(`Subtitles: ${media.subtitleLanguages.slice(0, 6).join(', ')}`);
      else if (media.automaticCaptionLanguages?.length) lines.push(`Auto captions: ${media.automaticCaptionLanguages.slice(0, 6).join(', ')}`);

      const transcript = data.transcript;
      if (transcript) {
        lines.push('');
        lines.push(
          `Transcript (${transcript.automatic ? 'auto' : 'manual'} ${transcript.language}, ${transcript.chars} of ${transcript.totalChars} chars):`,
        );
        lines.push(transcript.text);
      } else {
        lines.push('', 'No transcript available.');
      }
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        lines.push('', `Warnings: ${data.warnings.join(', ')}`);
      }
      return lines.join('\n');
    },
  },
  {
    name: 'read_download',
    description: 'Reads parsed markdown text from a downloaded document file (PDF, CSV, JSON, TXT).',
    parameters: {
      filename: z.string().describe('Filename in data/downloads/ to read'),
    },
    endpoint: '/downloads/read',
    payload: (args) => ({ filename: args.filename }),
    format: (data) => data.content || JSON.stringify(data, null, 2),
  },
  {
    name: 'record_start',
    description:
      'Starts a timelapse recording of the Cyberdeck window itself and returns once the capture stream is live. Frames are captured every few hundred milliseconds and played back faster than real time, so a long browsing/scrolling session becomes a short video. Stop with record_stop, which returns the absolute file path — ready to type into a file-upload field. Use list_recordings to find previous files.',
    parameters: {
      name: z.string().optional().describe('Optional label appended to the filename (e.g. "listing-upload")'),
    },
    endpoint: '/recording/start',
    payload: (args) => ({ name: args?.name }),
    format: (data) =>
      `Recording started: ${data.filename}\nOutput directory: ${data.config?.outputDir}\nCapture every ${data.config?.intervalMs}ms, playback at ${data.config?.fps}fps. Call record_stop to save it.`,
  },
  {
    name: 'record_stop',
    description:
      'Stops the timelapse and saves it as a .webm file. Returns the absolute path, byte size, frames captured and playback speed-up. The path can be typed directly into a file-upload field (or use list_recordings).',
    parameters: {},
    endpoint: '/recording/stop',
    format: (data) => {
      const rec = data.recording || data;
      if (!rec?.path) return JSON.stringify(data, null, 2);
      const mb = (rec.bytes / 1024 / 1024).toFixed(1);
      return `Saved ${rec.path}\n${mb} MB · ${rec.frames} frames · ${rec.videoSeconds}s of video · ${rec.speedup}× speed-up`;
    },
  },
  {
    name: 'list_recordings',
    description:
      'Lists finished timelapse recordings as absolute file paths, newest first. Use the path with a file-upload field (set the file input through the page, or hand it to a human if the field cannot be set programmatically).',
    parameters: {
      limit: z.coerce.number().optional().default(20).describe('Maximum recordings to return'),
    },
    endpoint: '/recording/list',
    method: 'GET',
    endpointFor: (args) => `/recording/list?limit=${Math.max(1, Number(args?.limit) || 20)}`,
    format: (data) => {
      const items = Array.isArray(data.recordings) ? data.recordings : [];
      if (!data.enabled) return 'Recording is disabled — enable it in Settings → Recording.';
      if (items.length === 0) return `No timelapses yet. They are written to ${data.outputDir}.`;
      const lines = items.map((item: any) => `- ${item.filename} (${(item.bytes / 1024 / 1024).toFixed(1)} MB) — ${item.path}`);
      return `### Timelapses (${items.length})\n${lines.join('\n')}`;
    },
  },
];
