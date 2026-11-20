/**
 * WebSocket & SSE Streams
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const STREAMS_TOOLS: ToolCatalogItem[] = [
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
];
