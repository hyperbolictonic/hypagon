/**
 * The shapes the network interceptor captures: requests, websocket/SSE streams, their frames and
 * the read filter.
 *
 * Why a module: the request buffer, the stream registry, the frame log, the CDP router and the
 * agent-facing surface all describe the same records, and keeping them beside the interceptor made
 * every collaborator import it back.
 */

/** When to use: `get_traffic`, `get_api_payload` and the CDP request lifecycle. */
export interface CapturedNetworkRequest {
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  status?: number;
  statusText?: string;
  mimeType?: string;
  requestTime: number;
  responseDurationMs?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  hasBody: boolean;
  bodyPreview?: string;
}

/** When to use: `get_streams` and the websocket/SSE lifecycle. */
export interface RealtimeStream {
  streamId: string;
  type: 'websocket' | 'sse';
  url: string;
  status: 'open' | 'closed' | 'error';
  createdAt: number;
  closedAt?: number;
  framesSentCount: number;
  framesReceivedCount: number;
  lastActivity: number;
}

/** When to use: `get_stream_messages` — one websocket frame or one SSE event. */
export interface StreamMessage {
  id: string;
  streamId: string;
  streamType: 'websocket' | 'sse';
  direction: 'sent' | 'received';
  timestamp: number;
  eventName?: string;
  eventId?: string;
  opcode?: number;
  data: string;
  isJson: boolean;
  jsonData?: any;
}

/** When to use: `getTraffic` — narrow by URL, method, resource type, status and count. */
export interface NetworkFilter {
  urlPattern?: string;
  method?: string;
  resourceType?: string; // 'XHR' | 'Fetch' | 'Document' | etc.
  status?: number;
  limit?: number;
}
