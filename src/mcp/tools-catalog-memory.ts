import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { formatMark } from './format-mark.js';
import { normaliseUrl, requireUrl } from './tool-args.js';
import { BRAND } from '../shared/brand.js';

/** When to use: the memory/cortex, shield & forms, downloads, recording and session entries. */
export const MEMORY_TOOLS: ToolCatalogItem[] = [
  // 5. Memory & Cortex (LanceDB)
  {
    name: 'recall_memory',
    description: 'Performs semantic vector and full-text hybrid search across all previously visited and harvested web pages in the persistent Cortex.',
    parameters: {
      query: z.string().describe('Natural language query to search page history memory'),
      limit: z.number().optional().default(5).describe('Max results (default: 5)'),
      domain: z.string().optional().describe('Filter by domain (e.g. "wikipedia.org")'),
    },
    endpoint: '/cortex/recall',
    payload: (args) => ({ query: args.query, limit: args.limit, domain: args.domain }),
    format: (data) => JSON.stringify(data.results, null, 2),
  },
  {
    name: 'browsing_history',
    description: 'Retrieves chronological browsing history from the Cortex store.',
    parameters: {
      limit: z.number().optional().default(20).describe('Max history entries (default: 20)'),
      domain: z.string().optional().describe('Filter by domain'),
    },
    endpoint: '/cortex/history',
    method: 'GET',
    payload: (args) => ({
      queryParams: {
        limit: String(args?.limit ?? 20),
        ...(args?.domain ? { domain: args.domain } : {}),
      },
    }),
    format: (data) => {
      const hist = Array.isArray(data.history) ? data.history : [];
      if (hist.length === 0) return 'No browsing history entries found.';
      const lines = hist.map((h: any) => {
        const time = h.visitedAt ? new Date(h.visitedAt).toLocaleDateString() : '';
        return `- [${time}] "${h.title || 'Untitled'}" - ${h.url}`;
      });
      return `### Browsing History (${hist.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'browsing_history_clear',
    description: 'Clears the chronological browsing history table in the Cortex database.',
    parameters: {},
    endpoint: '/cortex/history/clear',
    format: (data) => data.message || 'History cleared',
  },
  {
    name: 'add_bookmark',
    description: 'Saves a bookmark into the persistent Cortex library with custom tags and research notes.',
    parameters: {
      url: z.string().describe('Bookmark target URL'),
      title: z.string().describe('Descriptive title'),
      notes: z.string().optional().describe('Research notes or key takeaways'),
      tags: z.array(z.string()).optional().describe('Array of semantic categorization tags'),
    },
    endpoint: '/bookmarks/add',
    payload: (args) => ({ url: args.url, title: args.title, notes: args.notes, tags: args.tags }),
    format: (data, args) => `Bookmark saved: ${data.id || args.url}`,
  },
  {
    name: 'list_bookmarks',
    description: 'Retrieves saved bookmarks. Pass query to filter by terms found in the title, notes, URL, or tags (matches are ranked by relevance); pass tag for an exact tag match.',
    parameters: {
      query: z.string().optional().describe('Filter terms matched against bookmark title, notes, URL, and tags (every term must appear)'),
      tag: z.string().optional().describe('Filter by exact tag'),
      limit: z.number().optional().default(20).describe('Max bookmarks to return'),
    },
    endpoint: '/bookmarks',
    method: 'GET',
    payload: (args) => ({
      queryParams: {
        ...(args?.query ? { q: args.query } : {}),
        ...(args?.tag ? { tag: args.tag } : {}),
        limit: String(args?.limit ?? 20),
      },
    }),
    format: (data) => {
      const bm = Array.isArray(data.bookmarks) ? data.bookmarks : [];
      if (bm.length === 0) return 'No bookmarks found.';
      const lines = bm.map((b: any) => {
        const tags = Array.isArray(b.tags) && b.tags.length > 0 ? ` [${b.tags.join(', ')}]` : '';
        return `- [${b.id || 'bm'}] "${b.title || 'Untitled'}" - ${b.url}${tags}`;
      });
      return `### Saved Bookmarks (${bm.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'delete_bookmark',
    description: 'Removes a bookmark by URL or ID from the persistent database.',
    parameters: {
      url_or_id: z.string().describe('The bookmark ID or exact URL to remove'),
    },
    endpoint: '/bookmarks/delete',
    payload: (args) => ({ urlOrId: args.url_or_id }),
    format: (data, args) => (data.deleted ? `Bookmark deleted: ${args.url_or_id}` : `Bookmark not found: ${args.url_or_id}`),
  },

  // 6. Shield & Forms
  {
    name: 'dismiss_consent',
    description: 'Answer a cookie/GDPR consent wall by choosing the least invasive real control (reject/only-necessary before accept, per KUANG_CONSENT_POLICY=essential|accept|reject). Set force_remove=true only as a last resort when no control exists — that hides the overlay without answering it.',
    parameters: {
      policy: z.enum(['essential', 'accept', 'reject']).optional().describe('How to answer the wall: essential/reject prefer the least-invasive control, accept prefers "Accept all" (default: KUANG_CONSENT_POLICY or essential)'),
      force_remove: z.coerce.boolean().optional().describe('Last resort only: hide the overlay without answering it (no control matched)'),
    },
    endpoint: '/shield/dismiss',
    payload: (args) => ({ policy: args?.policy, force_remove: args?.force_remove === true }),
    format: (data) => {
      const r = data?.result ?? data ?? {};
      const head = r.dismissed
        ? `consent answered (${r.intent || 'accept'} via ${r.framework || 'generic'})`
        : r.blocked
          ? 'consent wall detected, no usable control — left for a human'
          : 'no consent wall detected';
      const bits = [head];
      if (r.targetText) bits.push(`control: "${r.targetText}"`);
      if (r.coordinates) bits.push(`at (${r.coordinates.x}, ${r.coordinates.y})`);
      if (r.message) bits.push(r.message);
      return bits.join(' · ');
    },
  },
  {
    name: 'fill_form',
    description: 'Fills multiple form fields (inputs, textareas, dropdowns, checkboxes, radios) in a single turn with human-like typing cadence.',
    parameters: {
      fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).describe('Map of CSS selectors to values'),
      submit_selector: z.string().optional().describe('Optional CSS selector of submit button'),
    },
    endpoint: '/form/fill',
    payload: (args) => ({ fields: args.fields, submitSelector: args.submit_selector }),
    format: (data) => JSON.stringify(data.result, null, 2),
  },

  // 7. Downloads
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

  // 7b. Timelapse recording
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

  // 8. Sessions & Cookies
  {
    name: 'save_session',
    hidden: true,
    deprecatedInFavorOf: 'context_save',
    description: 'Deprecated alias for context_save. Snapshots the current active browser session (cookies, localStorage, sessionStorage) into the persistent vault.',
    parameters: {
      name: z.string().describe('Unique name for the session snapshot (e.g. "github-auth")'),
    },
    endpoint: '/session/save',
    payload: (args) => ({ name: args.name }),
    format: (data, args) => `Session "${args.name}" saved successfully`,
  },
  {
    name: 'restore_session',
    hidden: true,
    deprecatedInFavorOf: 'context_open',
    description: 'Deprecated alias for context_open. Restores a previously saved session snapshot into the active browser partition.',
    parameters: {
      name: z.string().describe('Name of the session snapshot to restore'),
    },
    endpoint: '/session/restore',
    payload: (args) => ({ name: args.name }),
    format: (data, args) => `Session "${args.name}" restored successfully`,
  },
  {
    name: 'list_sessions',
    hidden: true,
    deprecatedInFavorOf: 'context_list',
    description: 'Deprecated alias for context_list. Returns all saved session profiles in the vault.',
    parameters: {},
    endpoint: '/session/list',
    method: 'GET',
    format: (data) => {
      const sess = Array.isArray(data.sessions) ? data.sessions : [];
      if (sess.length === 0) return 'No saved sessions found in vault.';
      const lines = sess.map((s: any) => {
        const cookies = s.cookieCount !== undefined ? `${s.cookieCount} cookies` : '';
        const savedAt = s.savedAt ? new Date(s.savedAt).toLocaleDateString() : '';
        return `- "${s.name || s.id}" (${[cookies, savedAt].filter(Boolean).join(', ')})`;
      });
      return `### Vault Sessions (${sess.length})\n${lines.join('\n')}`;
    },
  },

];

