/**
 * Tab Management
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const TABS_TOOLS: ToolCatalogItem[] = [
  {
    name: 'new_tab',
    description: 'Opens a new isolated browser tab in the Cyberdeck window and navigates to the given URL (default: about:blank).',
    parameters: {
      url: z.string().optional().describe('Initial URL to load (e.g. "https://news.ycombinator.com")'),
    },
    endpoint: '/tabs/new',
    payload: (args) => {
      let targetUrl = args?.url || args?.destination || args?.target || args?.link || args?.href || args?.address || '';
      if (typeof targetUrl === 'string' && targetUrl) {
        if (!/^https?:\/\//i.test(targetUrl) && !/^about:/i.test(targetUrl) && !/^mark-eleven:/i.test(targetUrl)) {
          targetUrl = 'https://' + targetUrl;
        }
      }
      return { url: targetUrl };
    },
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
