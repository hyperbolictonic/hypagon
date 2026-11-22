import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';

/** When to use: the catalog segment fronting network capture: traffic, payloads, JSON queries, realtime streams and HAR export. */
export const CAPTURE_TOOLS: ToolCatalogItem[] = [
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
{
    name: 'export_har',
    description: 'Exports captured network traffic as a HAR 1.2 log (request/response headers + body previews). Set save=true to write data/har/har_<ts>.har and get the path; otherwise the HAR JSON is returned.',
    parameters: {
      pattern: z.string().optional().describe('URL substring filter'),
      limit: z.coerce.number().optional().default(250).describe('Max entries'),
      save: z.coerce.boolean().optional().default(false).describe('Write the HAR to data/har/ and return the path instead of the JSON'),
    },
    endpoint: '/network/har',
    payload: (args) => ({ pattern: args?.pattern, limit: args?.limit, save: args?.save === true }),
    format: (data) => (data.filePath ? `HAR written to ${data.filePath} (${data.entries} entries)` : JSON.stringify(data.har)),
  },
];
