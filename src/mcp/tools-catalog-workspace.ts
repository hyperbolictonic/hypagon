import { z } from 'zod';
import { normaliseUrl, requireUrl } from './tool-args.js';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { queryPagingPayload, renderRows, rowsOf } from './tools-catalog-fields.js';

/** When to use: the catalog segment fronting the stateful workspace: tabs, zoom, viewport, downloads, contexts, recordings and the script vault. */
export const WORKSPACE_TOOLS: ToolCatalogItem[] = [
{
    name: 'new_tab',
    description: 'Opens a new isolated browser tab in the Cyberdeck window and navigates to the given URL (default: about:blank).',
    parameters: {
      url: z.string().optional().describe('Initial URL to load (e.g. "https://news.ycombinator.com")'),
    },
    endpoint: '/tabs/new',
    payload: (args) => ({ url: normaliseUrl(args) }),
    format: (data) => `Tab opened: ${data.tab?.id || data.tabId} (${data.tab?.url || data.url || 'about:blank'})`,
  },
{
    name: 'switch_tab',
    description: 'Switches focus to an existing browser tab by its unique tab ID.',
    parameters: {
      tab_id: z.coerce.string().describe('ID of the tab to switch to (e.g. "tab_1" or "1")'),
    },
    endpoint: '/tabs/switch',
    payload: (args) => {
      let rawId = args?.tab_id ?? args?.tabId ?? args?.tab ?? args?.id;
      if (rawId === undefined || rawId === null || rawId === '') {
        throw new Error('Missing tab_id. Please provide { "tab_id": "tab_1" } or call list_tabs() first.');
      }
      const tabId = typeof rawId === 'number' ? `tab_${rawId}` : String(rawId).startsWith('tab_') ? String(rawId) : !isNaN(Number(rawId)) ? `tab_${rawId}` : String(rawId);
      return { tabId };
    },
    format: (data, args) => data.message || `Switched to tab: ${args?.tab_id || data.tabId}`,
  },
{
    name: 'close_tab',
    description: 'Closes a browser tab by its tab ID (or active tab if omitted).',
    parameters: {
      tab_id: z.coerce.string().optional().describe('ID of tab to close (optional, closes active tab if omitted)'),
    },
    endpoint: '/tabs/close',
    payload: (args) => {
      let rawId = args?.tab_id ?? args?.tabId ?? args?.tab ?? args?.id;
      const tabId = rawId !== undefined && rawId !== null && rawId !== ''
        ? (typeof rawId === 'number' ? `tab_${rawId}` : String(rawId).startsWith('tab_') ? String(rawId) : !isNaN(Number(rawId)) ? `tab_${rawId}` : String(rawId))
        : undefined;
      return { tabId };
    },
    format: (data, args) => data.message || `Closed tab: ${args?.tab_id || data.tabId || 'active'}`,
  },
{
    name: 'list_tabs',
    description: 'Returns an array of all currently open tabs with their IDs, URLs, and page titles.',
    parameters: {},
    endpoint: '/tabs',
    method: 'GET',
    format: (data) => {
      const tabs = Array.isArray(data.tabs) ? data.tabs : [];
      if (tabs.length === 0) return 'No open tabs';
      return tabs.map((t: any) => `${t.isActive ? '* ' : '- '}[${t.id}] ${t.isLoading ? '(loading) ' : ''}"${t.title || 'Untitled'}" - ${t.url}`).join('\n');
    },
  },
{
    name: 'browser_zoom',
    description:
      'Reads or changes the page zoom and reports the exact CSS-to-physical proportions. By default the page is fitted to the OS display scale (for example 67% on a 150% Windows display), so CSS pixels, screenshot pixels and the human view stay comparable; `mode:"native"` on the toolbar restores Windows scale for people. Actions: status (default), in, out, reset, set(factor 0.25-5). After changing zoom, re-run observe/find because viewport geometry changed. Screenshots return zoom plus coordinate_scale for mapping image pixels back to CSS px.',
    parameters: {
      action: z.enum(['status', 'in', 'out', 'reset', 'set']).optional().default('status').describe('Read or change the zoom (default: status)'),
      factor: z.coerce.number().min(0.25).max(5).optional().describe('Exact zoom factor for action="set" (0.25-5; 1 = CSS px at Windows scale)'),
    },
    endpoint: '/zoom',
    payload: (args) => {
      const action = args?.action || 'status';
      if (action === 'set' && args?.factor === undefined) {
        throw new Error('action "set" requires a factor between 0.25 and 5.');
      }
      return { action, factor: args?.factor };
    },
    format: (data) => {
      const zoom = data.zoom || {};
      const css = zoom.viewport?.css || {};
      const physical = zoom.viewport?.physical || {};
      const pct = Math.round((zoom.factor || 0) * 100);
      const mode = zoom.custom
        ? 'custom'
        : zoom.mode === 'compensate'
          ? `fitted to ${Math.round((zoom.displayScale || 1) * 100)}% display`
          : 'Windows scale';
      return `Page zoom ${pct}% (${mode})\nCSS viewport ${css.width || 0}x${css.height || 0} | physical ${physical.width || 0}x${physical.height || 0} | devicePixelRatio ${(zoom.devicePixelRatio || 1).toFixed(2)}`;
    },
  },
{
    name: 'browser_viewport',
    description:
      'Emulates a device viewport on the active tab (Chromium device mode): CSS size, DPR, mobile and touch. Actions: status (default), set (preset or width/height), reset, rotate. After changing it, re-observe: the viewport geometry changed. Screenshots report the CSS/image coordinate scale.',
    parameters: {
      action: z.enum(['status', 'set', 'reset', 'rotate']).optional().default('status').describe('Read, set, reset or rotate the emulated viewport'),
      preset: z.string().optional().describe('Built-in device id (e.g. iphone-15, pixel-8, ipad-air)'),
      width: z.coerce.number().optional().describe('CSS viewport width for a custom size'),
      height: z.coerce.number().optional().describe('CSS viewport height for a custom size'),
      device_scale_factor: z.coerce.number().optional().describe('Emulated DPR (0.5-5)'),
      mobile: z.coerce.boolean().optional().describe('Enable mobile layout/viewport rules'),
      touch: z.coerce.boolean().optional().describe('Enable touch emulation'),
    },
    endpoint: '/viewport',
    payload: (args) => ({
      action: args?.action || 'status',
      preset: args?.preset,
      width: args?.width,
      height: args?.height,
      device_scale_factor: args?.device_scale_factor,
      mobile: args?.mobile,
      touch: args?.touch,
    }),
    format: (data) => {
      const viewport = data.viewport || {};
      if (!viewport.active) return `Viewport: full browser area (no device emulation)`;
      const spec = viewport.spec || {};
      return `Viewport ${spec.width}x${spec.height} @${spec.deviceScaleFactor}x (${viewport.orientation})${spec.mobile ? ' mobile' : ''}${spec.touch ? ' touch' : ''} · scale ${viewport.scale}`;
    },
  },
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
    name: 'context_save',
    description: 'Saves the current browsing context (cookies + storage) under a name — the profile abstraction for authenticated sessions.',
    parameters: { name: z.string().optional().describe('Context name (auto-generated if omitted)') },
    endpoint: '/context/save',
    payload: (args) => ({ name: args?.name }),
    format: (data) => JSON.stringify(data.result),
  },
{
    name: 'context_open',
    description: 'Restores (switches to) a named browsing context/profile, reloading its cookies and storage.',
    parameters: { name: z.string().describe('Context name to restore') },
    endpoint: '/context/open',
    payload: (args) => ({ name: args?.name }),
    format: (data) => JSON.stringify(data.result),
  },
{
    name: 'context_list',
    description: 'Lists saved browsing contexts (cookie/storage profiles).',
    parameters: {},
    endpoint: '/context/list',
    method: 'GET',
    format: (data) => JSON.stringify(data.contexts, null, 2),
  },
{
    name: 'context_delete',
    description: 'Deletes a saved browsing context/profile.',
    parameters: { name: z.string().describe('Context name to delete') },
    endpoint: '/context/delete',
    payload: (args) => ({ name: args?.name }),
    format: (data) => JSON.stringify({ deleted: data.deleted }),
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
{
    name: 'save_script',
    description: 'Saves a reusable browser JavaScript automation script into the persistent vault and Cortex vector index.',
    parameters: {
      name: z.string().describe('Unique name of the script'),
      description: z.string().describe('Natural language description of what the script does'),
      code: z.string().describe('Executable JavaScript code string'),
      parameters: z.record(z.string(), z.string()).optional().describe('Map of parameter names to descriptions'),
    },
    endpoint: '/scripts/save',
    payload: (args) => ({ name: args.name, description: args.description, code: args.code, parameters: args.parameters }),
    format: (data, args) => `Script "${args.name}" vaulted successfully`,
  },
{
    name: 'run_script',
    description: 'Executes a saved script from the Script Vault inside the active tab context with dynamic arguments.',
    parameters: {
      name: z.string().describe('Name of the script to execute'),
      args: z.record(z.string(), z.any()).optional().describe('Key-value arguments passed into script execution context'),
    },
    endpoint: '/scripts/run',
    payload: (args) => ({ name: args.name, args: args.args }),
    format: (data) => JSON.stringify(data.result, null, 2),
  },
{
    name: 'list_scripts',
    description: 'Lists or searches saved automation scripts in the Script Vault. Pass query to search by natural-language relevance (ranked); omit it to list everything. Pass tag for an exact tag match.',
    parameters: {
      query: z.string().optional().describe('Natural-language search across script name, description, code, and tags (ranked by relevance)'),
      tag: z.string().optional().describe('Filter by exact tag'),
      limit: z.number().optional().default(100).describe('Max scripts to return'),
    },
    endpoint: '/scripts/list',
    method: 'GET',
    payload: (args) => queryPagingPayload(args, 100),
    format: (data) =>
      renderRows(rowsOf(data, 'scripts'), {
        empty: 'No matching scripts in vault.',
        heading: (count) => `### Script Vault (${count})`,
        line: (s: any) => {
          const score = typeof s.score === 'number' ? ` (score: ${s.score.toFixed(2)})` : '';
          return `- "${s.name}"${score}: ${s.description || 'No description'}`;
        },
      }),
  },
{
    name: 'delete_script',
    description: 'Deletes a saved script from the persistent vault and LanceDB vector index.',
    parameters: {
      name: z.string().describe('Name of script to delete'),
    },
    endpoint: '/scripts/delete',
    payload: (args) => ({ name: args.name }),
    format: (data, args) => (data.deleted ? `Deleted script "${args.name}"` : `Script "${args.name}" not found`),
  },
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
