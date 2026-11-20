/**
 * Network & API Interception
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const NETWORK_TOOLS: ToolCatalogItem[] = [
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
];
