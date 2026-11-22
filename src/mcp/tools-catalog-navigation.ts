import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { formatMark } from './format-mark.js';
import { normaliseUrl, requireUrl } from './tool-args.js';
import { BRAND } from '../shared/brand.js';

/** When to use: the navigation, interaction and tab-management entries of the catalog. */
export const NAVIGATION_TOOLS: ToolCatalogItem[] = [
  // 1. Navigation
  {
    name: 'navigate_to',
    description: 'Navigates the real, visible Chromium browser window to a destination URL. Automatically dismisses GDPR/cookie consent overlays by default.',
    parameters: {
      url: z.string().describe('The destination URL (e.g. "https://news.ycombinator.com" or "https://www.skyscanner.net")'),
      auto_dismiss_consent: z.boolean().optional().default(true).describe('Whether to automatically detect and dismiss cookie/GDPR consent overlays (default: true)'),
    },
    endpoint: '/navigate',
    payload: (args) => ({ url: requireUrl(args), autoDismissConsent: args?.auto_dismiss_consent ?? true }),
    format: (data) => data.result || 'Navigation complete',
  },
  {
    name: 'go_to_url',
    hidden: true,
    deprecatedInFavorOf: 'navigate_to',
    description: 'Deprecated alias for navigate_to. Navigates the browser window to a destination URL.',
    parameters: {
      url: z.string().describe('The destination URL (e.g. "https://www.skyscanner.net")'),
    },
    endpoint: '/navigate',
    payload: (args) => ({ url: requireUrl(args) }),
    format: (data) => data.result || 'Navigation complete',
  },

  // 2. Interaction
  {
    name: 'click_element',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Clicks an element on the active web page using a CSS selector or direct viewport coordinates (x, y). Simulates realistic human pointer movement and switch actuation.',
    parameters: {
      selector: z.string().optional().describe('CSS selector of the element to click (e.g. "button.submit", "a[href*=\'login\']", "#search-input")'),
      x: z.coerce.number().optional().describe('Direct X coordinate on the viewport in pixels'),
      y: z.coerce.number().optional().describe('Direct Y coordinate on the viewport in pixels'),
    },
    endpoint: '/click',
    payload: (args) => {
      const selector = args?.selector || args?.element || args?.target || args?.css || args?.query;
      const x = args?.x !== undefined ? Number(args.x) : undefined;
      const y = args?.y !== undefined ? Number(args.y) : undefined;
      if (!selector && (x === undefined || y === undefined)) {
        throw new Error('Missing click target. Please provide either a "selector" (CSS selector) or ("x", "y") viewport coordinates.');
      }
      return { selector, x, y };
    },
    format: (data) => data.result || 'Click executed',
  },
  {
    name: 'type_text',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Types text into an input element or active element with realistic human Gaussian typing cadence (60-240ms per keystroke).',
    parameters: {
      text: z.string().describe('The text string to type (e.g. "London")'),
      selector: z.string().optional().describe('Optional CSS selector of the input element'),
    },
    endpoint: '/type',
    payload: (args) => {
      const text = args?.text !== undefined ? String(args.text) : (args?.value !== undefined ? String(args.value) : (args?.content !== undefined ? String(args.content) : (args?.input !== undefined ? String(args.input) : '')));
      const selector = args?.selector || args?.element || args?.target || args?.css;
      return { text, selector };
    },
    format: (data) => data.result || 'Text typed successfully',
  },
  {
    name: 'press_key',
    description: 'Dispatches a single hardware keyboard event (Enter, Tab, Escape, Backspace, ArrowDown, etc.).',
    parameters: {
      key: z.string().describe('The key name to press (e.g. "Enter", "Tab", "Escape", "Backspace")'),
    },
    endpoint: '/press-key',
    payload: (args) => {
      const key = args?.key || args?.key_name || args?.button || 'Enter';
      return { key };
    },
    format: (data) => data.result || 'Key pressed',
  },
  {
    name: 'scroll_page',
    description: 'Simulates organic inertial wheel scrolling in the active viewport.',
    parameters: {
      direction: z.enum(['up', 'down', 'top', 'bottom']).optional().default('down').describe('Scroll direction (default: "down")'),
      amount: z.number().optional().default(400).describe('Scroll amount in pixels (default: 400)'),
    },
    endpoint: '/scroll',
    payload: (args) => ({ direction: args?.direction || 'down', amount: args?.amount !== undefined ? Number(args.amount) : 400 }),
    format: (data) => data.result || 'Scrolled successfully',
  },

  {
    name: 'take_screenshot',
    description: 'Captures the active viewport. Two modes. PLAIN (default): fast 768px JPEG (~15ms), saved to data/screenshots/, returns the file path plus native image content. SET-OF-MARKS (marks=true): numbered badges on interactive elements — detail="full" (full-res PNG), detail="economy" (640px JPEG, ~10-20x lighter; best for vision), or detail="markdown" (marks table only, NO image; cheapest). Badge ids feed act(mark_id, action).',
    parameters: {
      marks: z.coerce.boolean().optional().default(false).describe('true = Set-of-Marks (badge interactive elements, return the marks table); false = plain viewport image (default)'),
      detail: z.enum(['full', 'economy', 'markdown']).optional().default('full').describe('Only when marks=true: "full" (PNG), "economy" (640px JPEG), or "markdown" (marks table only, no image)'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Only when marks=true: also badge elements outside the viewport (long/virtualized lists)'),
      max_width: z.coerce.number().optional().default(768).describe('Plain mode only: max width in pixels (default 768; pass 0 for full native resolution)'),
      format: z.enum(['jpeg', 'png']).optional().default('jpeg').describe('Plain mode only: image format (default "jpeg")'),
      quality: z.coerce.number().optional().default(70).describe('Plain mode only: JPEG quality 1-100 (default 70)'),
    },
    endpoint: '/screenshot',
    endpoints: ['/screenshot', '/marks/screenshot'],
    method: 'GET',
    endpointFor: (args) => (args?.marks === true ? '/marks/screenshot' : '/screenshot'),
    payload: (args) => {
      if (args?.marks === true) {
        const detail = args?.detail || 'full';
        return {
          queryParams: {
            ...(detail === 'economy' ? { economy: '1' } : {}),
            ...(detail === 'markdown' ? { text_only: '1' } : {}),
            include_offscreen: String(args?.include_offscreen === true),
          },
        };
      }
      const maxWidth = args?.max_width !== undefined ? Number(args.max_width) : 768;
      const format = args?.format || 'jpeg';
      const quality = args?.quality !== undefined ? Number(args.quality) : 70;
      return { queryParams: { max_width: String(maxWidth), format, quality: String(quality) } };
    },
    format: (data) => data.screenshot?.filePath ? `Screenshot saved to ${data.screenshot.filePath} (${data.screenshot.width || ''}x${data.screenshot.height || ''}px, ${data.screenshot.mimeType || 'image/jpeg'})` : 'Screenshot captured',
  },
  {
    name: 'get_page_markdown',
    hidden: true,
    deprecatedInFavorOf: 'observe',
    description: 'Deprecated alias for observe(as:"markdown"). Extracts the active page DOM converted to token-efficient Markdown with YAML frontmatter envelope (title, URL, timestamps). By default includes Set-of-Marks badges ([#1], [#2]...) directly on interactive elements (links, buttons, inputs) so you can call act(id) or act(id, action:"type", text) directly from the text without taking screenshots!',
    parameters: {
      include_marks: z.coerce.boolean().optional().default(true).describe('Whether to annotate interactive elements with [#ID] Set-of-Marks badges (default: true)'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also annotate interactive elements outside the current viewport so their [#ID] badges appear in the markdown (use for long/virtualized result lists; default: false)'),
    },
    endpoint: '/markdown',
    method: 'GET',
    payload: (args) => {
      const includeMarks = args?.include_marks !== false && args?.marks !== false;
      const includeOffscreen = args?.include_offscreen === true;
      return { queryParams: { include_marks: String(includeMarks), include_offscreen: String(includeOffscreen) } };
    },
    format: (data) => { const md = data.construct?.content || data.construct?.markdown || JSON.stringify(data, null, 2); return md.length > 25000 ? md.slice(0, 25000) + "\n\n... [Output truncated to 25000 chars]" : md; },
  },
  {
    name: 'harvest_markdown',
    hidden: true,
    deprecatedInFavorOf: 'observe',
    description: 'Deprecated alias for get_page_markdown. Extracts clean markdown with inline [#ID] marks from the active tab.',
    parameters: {
      include_marks: z.coerce.boolean().optional().default(true).describe('Whether to annotate interactive elements with [#ID] Set-of-Marks badges (default: true)'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also annotate interactive elements outside the current viewport (use for long/virtualized result lists; default: false)'),
    },
    endpoint: '/markdown',
    method: 'GET',
    payload: (args) => {
      const includeMarks = args?.include_marks !== false && args?.marks !== false;
      const includeOffscreen = args?.include_offscreen === true;
      return { queryParams: { include_marks: String(includeMarks), include_offscreen: String(includeOffscreen) } };
    },
    format: (data) => { const md = data.construct?.content || data.construct?.markdown || JSON.stringify(data, null, 2); return md.length > 25000 ? md.slice(0, 25000) + "\n\n... [Output truncated to 25000 chars]" : md; },
  },
  {
    name: 'jev_index',
    description:
      'Just-Enough-View (JEV) surface index for the active page: a compact map of sections with IDs, headings, token weights and one-line summaries instead of a full markdown dump (~95% smaller). Follow with read_section(section_id) to fetch only what is needed, or search_page(query) to locate text without expanding. Requires a configured decision model and the optional JEV setting.',
    parameters: {},
    endpoint: '/jev/index',
    method: 'GET',
    format: (data) => (data?.ok ? data.index : data?.error || 'JEV unavailable'),
  },
  {
    name: 'read_section',
    description: 'Fetch the complete Markdown body for a section ID from the current JEV page index (e.g. "sec_1.1"). Set include_children=true to pull nested subsections too.',
    parameters: {
      section_id: z.string().describe('Section ID from jev_index, e.g. "sec_2" or "sec_1.1"'),
      include_children: z.coerce.boolean().optional().default(false).describe('Also return nested subsections (default: false)'),
    },
    endpoint: '/jev/read',
    method: 'POST',
    payload: (args) => ({ section_id: args?.section_id ?? args?.sectionId ?? '', include_children: args?.include_children === true }),
    format: (data) => {
      if (!data?.ok) return data?.error || 'Section unavailable';
      const folded = (data.folded || []).join('\n');
      return `${data.content}${folded ? `\n\n---\nAuto-fold hint:\n${folded}` : ''}`;
    },
  },
  {
    name: 'search_page',
    description: 'Run a fast keyword/regex query over all folded JEV section text without expanding it. Returns matching section IDs, counts and snippets; then call read_section for context.',
    parameters: {
      query: z.string().describe('Keyword or regular expression to find across the page'),
    },
    endpoint: '/jev/search',
    method: 'POST',
    payload: (args) => ({ query: args?.query ?? args?.text ?? '' }),
    format: (data) => {
      if (!data?.ok) return data?.error || 'Search unavailable';
      const hits = Array.isArray(data.hits) ? data.hits : [];
      if (!hits.length) return 'No matches.';
      return hits.map((hit: { section_id: string; heading: string; matches: number; snippet: string }) => `- [${hit.section_id}] ${hit.heading} (${hit.matches} match${hit.matches === 1 ? '' : 'es'}) — ${hit.snippet}`).join('\n');
    },
  },
  {
    name: 'evaluate_javascript',
    description: 'Executes a JavaScript expression or script in the active page context and returns the serialized result. A powerful tool that can read AND mutate the page — reach for it deliberately: observe/extract cover most reads and act covers clicks and typing, and heavy injected JS is a bot-detection signal.',
    parameters: {
      script: z.string().describe('JavaScript code to evaluate in the page context (e.g. "document.title" or "1+1")'),
    },
    endpoint: '/evaluate',
    payload: (args) => {
      const script = args?.script || args?.code || args?.js || args?.expression || args?.javascript || '';
      if (!script) {
        throw new Error('Missing script to evaluate. Please provide { "script": "..." }');
      }
      return { script };
    },
    format: (data) => JSON.stringify(data.result, null, 2),
  },
  {
    name: 'get_page_info',
    hidden: true,
    deprecatedInFavorOf: 'bridge_health',
    description: 'Deprecated alias for bridge_health() + page_state(). Returns the current URL, page title, navigation status, tab count, and active tab ID of the browser window.',
    parameters: {},
    endpoint: '/page-info',
    method: 'GET',
    format: (data) => JSON.stringify(data.info, null, 2),
  },
  {
    name: 'navigate_history',
    description: 'Navigates back or forward in the browser history.',
    parameters: {
      direction: z.enum(['back', 'forward']).describe('Navigation direction: "back" or "forward"'),
    },
    endpoint: '/history',
    payload: (args) => ({ action: args.direction }),
    format: (data, args) => data.result || `Navigated ${args.direction}`,
  },
  {
    name: 'get_console_logs',
    description: 'Returns the recent console logs (log, warn, error, info) emitted by the active web page.',
    parameters: {
      limit: z.number().optional().default(50).describe('Max entries to return (default: 50)'),
    },
    endpoint: '/console/logs',
    method: 'GET',
    payload: (args) => ({ queryParams: { limit: String(args?.limit ?? 50) } }),
    format: (data) => {
      const logs = Array.isArray(data.logs) ? data.logs : [];
      if (logs.length === 0) return 'No console logs captured.';
      const lines = logs.map((l: any) => {
        const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : '';
        const level = (l.level || 'info').toUpperCase().padEnd(5);
        return `[${time}] ${level} ${l.message || ''}`;
      });
      return `### Console Logs (${logs.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'get_fingerprint_profile',
    description: 'Inspects the active hardware spoofing profile (User-Agent, Platform, Screen, WebGL, Audio).',
    parameters: {},
    endpoint: '/fingerprint',
    method: 'GET',
    format: (data) => JSON.stringify(data.profile, null, 2),
  },

  // 4. Tab Management
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

];

