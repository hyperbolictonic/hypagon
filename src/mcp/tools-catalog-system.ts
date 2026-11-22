import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { formatMark } from './format-mark.js';
import { normaliseUrl, requireUrl } from './tool-args.js';
import { BRAND } from '../shared/brand.js';

/** When to use: the network, marks, script vault, streams, tray and HIL entries. */
export const SYSTEM_TOOLS: ToolCatalogItem[] = [
  // 9. Network & API Interception
  {
    name: 'get_network_traffic',
    description: 'Inspects captured HTTP network requests and responses made by the active browser tab.',
    parameters: {
      url_pattern: z.string().optional().describe('URL substring or regex filter'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).optional().describe('Filter by HTTP method'),
      resource_type: z.enum(['xhr', 'fetch', 'document', 'script', 'stylesheet', 'image', 'other']).optional().describe('Filter by resource type'),
      limit: z.number().optional().default(50).describe('Max records to return'),
      since: z.union([z.literal('last_action'), z.coerce.number()]).optional().describe('Only requests at/after this epoch-ms timestamp, or the literal "last_action" to correlate XHRs with the most recent action (click/type/navigate/act).'),
    },
    endpoint: '/network/traffic',
    payload: (args) => ({
      urlPattern: args.url_pattern,
      method: args.method,
      resourceType: args.resource_type,
      limit: args.limit,
      since: args.since,
    }),
    format: (data) => {
      const list = Array.isArray(data.traffic) ? data.traffic : [];
      if (list.length === 0) return 'No matching network requests captured.';
      const lines = list.map((r: any) => {
        const status = r.status ? String(r.status) : 'pending';
        const dur = r.responseDurationMs !== undefined ? `${r.responseDurationMs}ms` : '';
        const bodyTag = r.hasBody ? ' [HAS_BODY]' : '';
        return `[${r.requestId}] ${status} ${r.method} ${r.url.slice(0, 80)}${r.url.length > 80 ? '...' : ''} (${r.resourceType}${dur ? `, ${dur}` : ''})${bodyTag}`;
      });
      return `### Captured Network Requests (${list.length})\nUse query_json_data({ source: "network_payload", source_id: "<requestId>" }) to inspect JSON bodies.\n\n${lines.join('\n')}`;
    },
  },
  {
    name: 'get_api_payload',
    hidden: true,
    deprecatedInFavorOf: 'query_json_data',
    description: 'Deprecated alias for query_json_data({ source: "network_payload", source_id }). Retrieves the complete JSON body of a specific API response captured during network interception.',
    parameters: {
      request_id: z.string().describe('ID of captured request'),
    },
    endpoint: '/network/payload',
    payload: (args) => ({ requestId: args.request_id }),
    format: (data) => JSON.stringify(data.payload, null, 2),
  },
  {
    name: 'clear_network_traffic',
    hidden: true,
    deprecatedInFavorOf: 'clear_capture',
    description: 'Deprecated alias for clear_capture({ scope: "network" }). Clears the in-memory network traffic ring buffer.',
    parameters: {},
    endpoint: '/network/clear',
    format: (data) => data.message || 'Network traffic cleared',
  },
  {
    name: 'query_json_data',
    description: 'Token-efficient JSON navigator. Inspects schemas, extracts nested dot/bracket paths (e.g. "items[0..3].price"), searches keys, or runs filters without dumping massive multi-megabyte payloads into the LLM context.',
    parameters: {
      source: z.enum(['network_payload', 'stream_messages', 'download_file', 'inline_json']).default('network_payload').describe('Data source: "network_payload" (from get_network_traffic), "stream_messages" (from list_realtime_streams), "download_file" (from data/downloads/), or "inline_json"'),
      source_id: z.string().optional().describe('Target request ID, stream ID, or download filename'),
      path: z.string().optional().describe('JSONPath / dot-notation query, e.g. "itineraries[0..3].pricing", "users[*].email", "items[?price < 300]"'),
      view: z.enum(['value', 'schema', 'keys', 'summary']).optional().default('value').describe('Inspection mode: "schema" (types and array lengths without data), "keys" (object keys list), "summary" (high-level structure sample), or "value" (extracted target slice)'),
      limit: z.coerce.number().optional().default(25).describe('Max array items to return (default: 25)'),
      filter_predicate: z.string().optional().describe('Filter expression for array elements, e.g. "price < 300", "usesCookies == true". Tip: Apply to object arrays (e.g. path="vendors") rather than leaf string projections (e.g. "vendors.name")'),
      json_string: z.string().optional().describe('Inline JSON string (when source is "inline_json")'),
    },
    endpoint: '/json/query',
    payload: (args) => ({
      source: args?.source || 'network_payload',
      sourceId: args?.source_id ?? args?.sourceId ?? args?.requestId ?? args?.request_id ?? args?.streamId ?? args?.stream_id ?? args?.filename,
      path: args?.path ?? args?.query,
      view: args?.view ?? args?.mode ?? 'value',
      limit: args?.limit !== undefined ? Number(args.limit) : 25,
      filterPredicate: args?.filter_predicate ?? args?.filterPredicate ?? args?.filter,
      jsonString: args?.json_string ?? args?.jsonString ?? args?.json,
    }),
    format: (data) => {
      const header = `### JSON Navigator Query [${data.path || '$'}] (view: ${data.view}${data.matchCount !== undefined ? `, total: ${data.matchCount}` : ''})\n`;
      if (typeof data.data === 'string') return `${header}${data.data}`;
      return `${header}\`\`\`json\n${JSON.stringify(data.data, null, 2)}\n\`\`\``;
    },
  },
  {
    name: 'snapshot_rendered_page',
    description: 'Captures a post-hydration, rendered point-in-time snapshot of dynamic, JavaScript-heavy pages (React, Next.js, Vue). Freezes live state, pierces Shadow DOM, and extracts ultra-token-efficient Accessibility (AX) Trees or rendered Markdown.',
    parameters: {
      format: z.enum(['ax_tree', 'markdown', 'html', 'unrendered_html']).optional().default('ax_tree').describe('Snapshot format: "ax_tree" (recommended: semantic roles, labels, and states with zero cosmetic div noise), "markdown" (computed DOM markdown with live values), "html" (rendered static HTML), or "unrendered_html" (raw pre-mutation HTML source)'),
      wait_until_idle_ms: z.coerce.number().optional().default(400).describe('Time in ms to wait for pending network microtasks and React state updates to settle (default: 400)'),
      pierce_shadow_dom: z.coerce.boolean().optional().default(true).describe('Whether to traverse and unwrap encapsulated Shadow Roots (#shadow-root)'),
      save_to_disk: z.coerce.boolean().optional().default(false).describe('Whether to persist snapshot to data/snapshots/ for offline re-inspection via query_json_data'),
      force_rerender: z.coerce.boolean().optional().default(false).describe('Whether to force reflow and dispatch resize events to trigger re-renders before snapshotting'),
    },
    endpoint: '/snapshot/rendered',
    payload: (args) => ({
      format: args?.format || 'ax_tree',
      waitUntilIdleMs: args?.wait_until_idle_ms !== undefined ? Number(args.wait_until_idle_ms) : 400,
      pierceShadowDom: args?.pierce_shadow_dom !== undefined ? Boolean(args.pierce_shadow_dom) : true,
      saveToDisk: args?.save_to_disk !== undefined ? Boolean(args.save_to_disk) : false,
      forceRerender: args?.force_rerender !== undefined ? Boolean(args.force_rerender) : false,
    }),
    format: (data) => {
      const stats = data.stats || {};
      const fileNotice = data.filePath ? ` (Saved to: ${data.filePath})` : '';
      const header = `### Rendered Page Snapshot [${data.format?.toUpperCase()}] — "${data.title}" (${stats.estimatedTokens || 0} est tokens, ${stats.byteLength || 0} bytes)${fileNotice}\nURL: ${data.url}\n\n`;
      return `${header}${data.content || 'Snapshot empty'}`;
    },
  },
  {
    name: 'prerender_links',
    description: 'Speculative Pre-rendering Engine. Pre-executes, hydrates, and caches candidate links in background views so subsequent navigation is 0ms instantaneous. Automatically distills and indexes content into LanceDB Cortex memory.',
    parameters: {
      urls: z.array(z.string()).optional().describe('Specific candidate URLs to prerender. If omitted, uses selector or page link heuristics'),
      selector: z.string().optional().describe('CSS selector to pick candidate links from the active page (e.g. "a.search-result", ".docs-nav a")'),
      max_pages: z.coerce.number().optional().default(3).describe('Maximum candidate pages to prerender in background pool (max: 3)'),
      harvest_to_cortex: z.coerce.boolean().optional().default(true).describe('Whether to automatically distill and index pre-rendered pages into LanceDB Cortex memory for instant recall_memory'),
      wait_until_idle_ms: z.coerce.number().optional().default(500).describe('Hydration wait time per candidate view'),
    },
    endpoint: '/prerender/links',
    payload: (args) => ({
      urls: args?.urls,
      selector: args?.selector,
      maxPages: args?.max_pages !== undefined ? Number(args.max_pages) : 3,
      harvestToCortex: args?.harvest_to_cortex !== undefined ? Boolean(args.harvest_to_cortex) : true,
      waitUntilIdleMs: args?.wait_until_idle_ms !== undefined ? Number(args.wait_until_idle_ms) : 500,
    }),
    format: (data) => {
      const list = Array.isArray(data.prerendered) ? data.prerendered : [];
      if (list.length === 0) return 'No candidate links were pre-rendered.';
      const lines = list.map((u: string) => `- [0ms READY] ${u}`);
      return `### Speculative Pre-rendered Pool (${list.length} pages warm & indexed to Cortex)\nSubsequent navigate_to() calls targeting these URLs will load with 0ms perceived latency.\n\n${lines.join('\n')}`;
    },
  },

  // 10. Set-of-Marks (SoM) Grounding
  {
    name: 'take_annotated_screenshot',
    hidden: true,
    deprecatedInFavorOf: 'take_screenshot',
    description: 'Deprecated alias for take_screenshot(marks:true, detail:"full"). Visual Grounding with Set-of-Marks. Renders high-contrast numbered badges over interactable elements, takes a screenshot, saves to data/screenshots/, and returns both native image and mark mapping. Set include_offscreen=true to also badge elements below/above the fold (long result lists).',
    parameters: {
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also badge interactive elements outside the current viewport (default: false)'),
    },
    endpoint: '/marks/screenshot',
    method: 'GET',
    payload: (args) => ({ queryParams: { include_offscreen: String(args?.include_offscreen === true) } }),
    format: (data) => (Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data)),
  },
  {
    name: 'take_economy_screenshot',
    hidden: true,
    deprecatedInFavorOf: 'take_screenshot',
    description: 'Deprecated alias for take_screenshot(marks:true, detail:"economy"). Lightweight Set-of-Marks screenshot: downscaled to 640px wide JPEG (~10-20x smaller than take_annotated_screenshot) plus the same mark mapping. Use for vision models when token/bandwidth cost matters. Set include_offscreen=true to also badge elements below/above the fold.',
    parameters: {
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also badge interactive elements outside the current viewport (default: false)'),
    },
    endpoint: '/marks/screenshot',
    method: 'GET',
    payload: (args) => ({ queryParams: { economy: '1', include_offscreen: String(args?.include_offscreen === true) } }),
    format: (data) => (Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data)),
  },
  {
    name: 'list_marks',
    hidden: true,
    deprecatedInFavorOf: 'observe',
    description: 'Deprecated alias for observe(as:"som"). Text-only Set-of-Marks: returns the numbered interactive element table with NO image. Use for text-only models or the cheapest possible page scan; act(mark_id, action) works afterwards. On long/virtualized result lists set include_offscreen=true so below-the-fold items are numbered too (act scrolls them into view).',
    parameters: {
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also number interactive elements outside the current viewport so long result lists are fully listed (default: false)'),
    },
    endpoint: '/marks/screenshot',
    method: 'GET',
    payload: (args) => ({ queryParams: { text_only: '1', include_offscreen: String(args?.include_offscreen === true) } }),
    format: (data) => (Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data)),
  },
  {
    name: 'click_mark',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Clicks an annotated element using its Set-of-Marks badge index from take_annotated_screenshot.',
    parameters: {
      mark_id: z.coerce.number().describe('The numeric ID of the mark badge to click (e.g. 1)'),
    },
    endpoint: '/marks/click',
    payload: (args) => {
      const raw = args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number;
      if (raw === undefined || raw === null || isNaN(Number(raw))) {
        throw new Error('Missing mark_id. Please provide { "mark_id": 1 } from take_annotated_screenshot().');
      }
      return { markId: Number(raw) };
    },
    format: (data, args) => `Clicked mark #${args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number}`,
  },
  {
    name: 'type_mark',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Types text into an annotated input element using its Set-of-Marks badge index.',
    parameters: {
      mark_id: z.coerce.number().describe('The numeric ID of the mark badge to type into (e.g. 1)'),
      text: z.string().describe('The text string to type into the marked element (e.g. "London")'),
      clear_first: z.coerce.boolean().optional().default(false).describe('Whether to clear existing text before typing'),
    },
    endpoint: '/marks/type',
    payload: (args) => {
      const rawId = args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number;
      if (rawId === undefined || rawId === null || isNaN(Number(rawId))) {
        throw new Error('Missing mark_id. Please provide { "mark_id": 1, "text": "..." }');
      }
      const text = String(args?.text ?? args?.value ?? args?.content ?? args?.input ?? '');
      const clearFirst = Boolean(args?.clear_first ?? args?.clearFirst ?? false);
      return { markId: Number(rawId), text, clearFirst };
    },
    format: (data, args) => `Typed into mark #${args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number}`,
  },

  // 11. Script Vault & Macro Engine
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
    payload: (args) => ({
      queryParams: {
        ...(args?.query ? { q: args.query } : {}),
        ...(args?.tag ? { tag: args.tag } : {}),
        limit: String(args?.limit ?? 100),
      },
    }),
    format: (data) => {
      const scripts = Array.isArray(data.scripts) ? data.scripts : [];
      if (scripts.length === 0) return 'No matching scripts in vault.';
      const lines = scripts.map((s: any) => {
        const score = typeof s.score === 'number' ? ` (score: ${s.score.toFixed(2)})` : '';
        return `- "${s.name}"${score}: ${s.description || 'No description'}`;
      });
      return `### Script Vault (${scripts.length})\n${lines.join('\n')}`;
    },
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

  // 12. WebSocket & SSE Streams
  {
    name: 'list_realtime_streams',
    description: 'Returns all active and recent WebSockets (wss://) and Server-Sent Events (SSE) connections.',
    parameters: {
      type: z.enum(['websocket', 'sse']).optional().describe('Filter by protocol'),
      active_only: z.boolean().optional().describe('Filter for open streams only (default: false)'),
    },
    endpoint: '/streams/list',
    payload: (args) => ({ type: args.type, activeOnly: args.active_only }),
    format: (data) => {
      const list = Array.isArray(data.streams) ? data.streams : [];
      if (list.length === 0) return 'No realtime streams (WebSocket/SSE) captured.';
      const lines = list.map((s: any) => {
        const state = s.closed ? 'closed' : 'OPEN';
        return `[${s.streamId}] ${s.type.toUpperCase()} ${state} ${s.url} (msgs: ${s.messageCount || 0})`;
      });
      return `### Realtime Streams (${list.length})\nUse query_json_data({ source: "stream_messages", source_id: "<streamId>" }) to inspect stream data.\n\n${lines.join('\n')}`;
    },
  },
  {
    name: 'get_stream_messages',
    hidden: true,
    deprecatedInFavorOf: 'query_json_data',
    description: 'Deprecated alias for query_json_data({ source: "stream_messages" }). Inspects captured incoming and outgoing real-time messages / frames from WebSockets or SSE.',
    parameters: {
      stream_id: z.string().optional().describe('Filter by specific streamId'),
      type: z.enum(['websocket', 'sse']).optional().describe('Filter by protocol'),
      direction: z.enum(['sent', 'received']).optional().describe('Filter by direction'),
      limit: z.number().optional().default(50).describe('Max frames to return'),
    },
    endpoint: '/streams/messages',
    payload: (args) => ({ streamId: args.stream_id, type: args.type, direction: args.direction, limit: args.limit }),
    format: (data) => {
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      if (msgs.length === 0) return 'No stream messages captured.';
      const lines = msgs.map((m: any) => {
        const dir = (m.direction || 'msg').toUpperCase();
        const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
        const preview = typeof m.data === 'string' ? m.data.slice(0, 100) : JSON.stringify(m.data || m.jsonData || '').slice(0, 100);
        return `[${time}] ${dir} (stream: ${m.streamId || 'n/a'}): ${preview}`;
      });
      return `### Realtime Messages (${msgs.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'clear_stream_messages',
    hidden: true,
    deprecatedInFavorOf: 'clear_capture',
    description: 'Deprecated alias for clear_capture({ scope: "streams" }). Clears the in-memory WebSocket and SSE message frame buffer.',
    parameters: {
      stream_id: z.string().optional().describe('Optional specific streamId to clear'),
    },
    endpoint: '/streams/clear',
    payload: (args) => ({ streamId: args.stream_id }),
    format: (data) => data.message || 'Stream messages cleared',
  },
  {
    name: 'clear_capture',
    description: 'Clears the in-memory capture ring buffers. scope="network" clears captured HTTP traffic (see get_network_traffic), scope="streams" clears WebSocket/SSE message frames (see list_realtime_streams), scope="all" (default) clears both.',
    parameters: {
      scope: z.enum(['network', 'streams', 'all']).optional().default('all').describe('Which capture buffer to clear: "network" (HTTP traffic), "streams" (WebSocket/SSE frames), or "all" (default)'),
    },
    endpoint: '/capture/clear',
    payload: (args) => ({ scope: args?.scope || 'all' }),
    format: (data) => data.message || 'Capture buffers cleared',
  },

  // 13. System Tray & Window Visibility
  {
    name: 'set_window_visibility',
    description: 'Shows/restores or hides the Cyberdeck desktop window. Showing (the default) also brings the window to the foreground and focuses it — use this to make the window visible to a human (HIL); pass focus=false to show without stealing focus. Synthetic agent input is focus-independent, so this is not needed for normal driving.',
    parameters: {
      visible: z.coerce.boolean().optional().describe('true to restore and show the window (default); false to minimize/hide to the system tray'),
      focus: z.coerce.boolean().optional().describe('When showing, whether to bring the window to the foreground and focus it (default: true)'),
    },
    endpoint: '/window/visibility',
    payload: (args) => ({
      visible: args?.visible !== undefined ? Boolean(args.visible) : true,
      ...(args?.focus !== undefined ? { focus: Boolean(args.focus) } : {}),
    }),
    format: (data, args) => JSON.stringify({ success: true, visible: data.visible, focused: data.focused, state: (args?.visible ?? true) ? 'WINDOW_RESTORED' : 'MINIMIZED_TO_TRAY' }),
  },
  {
    name: 'configure_system_tray',
    description: 'Inspects or configures system tray behavior (such as enabling/disabling close-to-tray).',
    parameters: {
      close_to_tray: z.boolean().optional().describe('If specified, enables (true) or disables (false) minimize-to-tray when closing window'),
    },
    endpoint: '/window/tray',
    payload: (args) => ({ closeToTray: args?.close_to_tray }),
    format: (data) => JSON.stringify({ close_to_tray: data.closeToTray }, null, 2),
  },

  // 14. Human-In-The-Loop (HIL) Intervention & Desktop Notifications
  {
    name: 'request_human_intervention',
    description: 'PROACTIVELY call this whenever encountering CAPTCHAs, Cloudflare Turnstile, login/2FA prompts, payment checkouts, or unexpected roadblocks. Halts agent execution, triggers audible desktop alerts, unhides and brings window to front, flashes taskbar, and presents an interactive HUD banner for human assistance.',
    parameters: {
      reason: z.string().describe('Clear explanation of what human action is needed (e.g. "Please solve the Cloudflare Turnstile challenge" or "Please enter 2FA code")'),
      timeout_seconds: z.number().optional().describe('Max seconds to wait for human action (default: 180)'),
      bring_to_front: z.boolean().optional().default(true).describe('Whether to unhide/restore window from tray and bring to front (default: true)'),
    },
    endpoint: '/hil/request',
    payload: (args) => {
      const reason = args?.reason || args?.message || args?.prompt || 'Human assistance requested by AI agent.';
      const timeoutSeconds = args?.timeout_seconds !== undefined ? Number(args.timeout_seconds) : undefined;
      const bringToFront = args?.bring_to_front ?? true;
      return { reason, timeoutSeconds, bringToFront };
    },
    format: (data) => JSON.stringify(data.result, null, 2),
  },
  {
    name: 'resolve_human_intervention',
    description: 'Resolves an active human intervention request, unpausing the agent.',
    parameters: {
      id: z.string().optional().describe('Specific intervention ID'),
      notes: z.string().optional().describe('Confirmation notes or summary of action taken'),
    },
    endpoint: '/hil/resolve',
    payload: (args) => ({ id: args?.id, notes: args?.notes }),
    format: (data, args) => (data.resolved ? `Intervention resolved: ${args?.notes || 'User confirmed.'}` : 'No pending intervention request found.'),
  },
  {
    name: 'get_human_intervention_status',
    description: 'Inspects pending Human-In-The-Loop (HIL) requests. This is distinct from explicit human control; use get_human_activity for that.',
    parameters: {},
    endpoint: '/hil/active',
    method: 'GET',
    format: (data) => JSON.stringify(data, null, 2),
  },
  {
    name: 'get_human_activity',
    description: 'Reports explicit human control: whether a person has pressed TAKE OVER and is blocking synthetic input (HUMAN_CONTROL / HUMAN_IN_PROGRESS), how long, and the last human page event. Page input alone no longer pauses the agent.',
    parameters: {},
    endpoint: '/human/status',
    method: 'GET',
    format: (data) => JSON.stringify(data, null, 2),
  },
  {
    name: 'send_notification',
    description: 'Dispatches an OS native desktop notification to alert the user without blocking agent execution.',
    parameters: {
      message: z.string().describe('Notification body message'),
      title: z.string().optional().default(BRAND.product).describe('Notification title'),
      urgency: z.enum(['normal', 'critical', 'low']).optional().default('normal').describe('Urgency level (default: normal)'),
      sound: z.boolean().optional().default(true).describe('Whether to play notification alert sound (default: true)'),
    },
    endpoint: '/notify',
    payload: (args) => {
      const title = args?.title || BRAND.product;
      const message = args?.message || args?.text || args?.body || 'Agent notification';
      return { title, message, urgency: args?.urgency, sound: args?.sound };
    },
    format: (data, args) => JSON.stringify({ success: data.sent, title: args?.title || BRAND.product, message: args?.message || 'Notification sent' }),
  },
  {
    name: 'send_desktop_notification',
    hidden: true,
    deprecatedInFavorOf: 'send_notification',
    description: 'Deprecated alias for send_notification (same /notify endpoint; defaults urgency=critical). Triggers a native desktop notification to summon the human operator for Human-in-the-Loop (HIL) assistance (e.g. 2FA code, SMS prompt, CAPTCHA override, or manual login).',
    parameters: {
      message: z.string().describe('Specific reason why the user is needed and instructions for what to do in the browser.'),
      title: z.string().optional().default(`${BRAND.browser}: Human Intervention Required`).describe('Notification title'),
      urgency: z.enum(['low', 'normal', 'critical']).optional().default('critical').describe('Urgency level of the notification.'),
      sound: z.boolean().optional().default(true).describe('Whether to play notification alert sound (default: true)'),
    },
    endpoint: '/notify',
    payload: (args) => {
      const title = args?.title || `${BRAND.browser}: Human Intervention Required`;
      const message = args?.message || args?.text || args?.body || `Human intervention required in ${BRAND.browser}`;
      return { title, message, urgency: args?.urgency || 'critical', sound: args?.sound ?? true };
    },
    format: (data, args) => JSON.stringify({ success: data.sent, title: args?.title || `${BRAND.browser}: Human Intervention Required`, message: args?.message || 'Notification sent' }),
  },

];

