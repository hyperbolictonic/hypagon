/**
 * Network-inspection surface.
 *
 * Owns the captured traffic, API payloads and realtime websocket/SSE streams.
 * Tabs attach their web contents through `manager`; this surface is the
 * agent-facing read/clear side the bridge routes call.
 */
import { NetworkInterceptor } from './network-interceptor.js';
import type { CapturedNetworkRequest, NetworkFilter, RealtimeStream, StreamMessage } from './types.js';

/** Dependencies the network surface needs for directive logging. */
export interface NetworkSurfaceDeps {
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** The captured traffic, payloads and stream reads. */
export class NetworkSurface {
  /** The interceptor; tabs attach through it as they are created. */
  readonly manager = new NetworkInterceptor();

  constructor(private readonly deps: NetworkSurfaceDeps) {}

  traffic(filter?: NetworkFilter): CapturedNetworkRequest[] {
    return this.manager.getTraffic(filter);
  }

  payload(requestId: string) {
    this.deps.log('action', `MCP Directive: get_api_payload("${requestId}")`);
    return this.manager.getPayload(requestId);
  }

  clear(): void {
    this.deps.log('action', 'MCP Directive: clear_network_traffic()');
    this.manager.clear();
  }

  streams(options?: { type?: 'websocket' | 'sse'; activeOnly?: boolean }): RealtimeStream[] {
    return this.manager.getStreams(options);
  }

  streamMessages(options?: {
    streamId?: string;
    type?: 'websocket' | 'sse';
    direction?: 'sent' | 'received';
    limit?: number;
  }): StreamMessage[] {
    this.deps.log('action', `MCP Directive: get_stream_messages(${options?.type || 'all'})`);
    return this.manager.getStreamMessages(options);
  }

  clearStreamMessages(streamId?: string): void {
    this.deps.log('action', 'MCP Directive: clear_stream_messages()');
    this.manager.clearStreamMessages(streamId);
  }
}
