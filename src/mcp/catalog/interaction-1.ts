/**
 * Interaction (part 1 of 2)
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const INTERACTION_1_TOOLS: ToolCatalogItem[] = [
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
];
