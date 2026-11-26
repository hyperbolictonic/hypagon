/**
 * The CDP event router: one handler per network event, over the three buffers.
 *
 * Why a module: the interceptor used to switch over nine event names in one 110-line method. The
 * lifecycle rules — when a body is worth fetching, when a websocket error only marks its stream —
 * are now each their own method.
 */
import type { BrowserTarget } from '../target.ts';
import type { StreamMessages } from './stream-messages.ts';
import type { StreamRegistry } from './stream-registry.ts';
import type { TrafficBuffer } from './traffic-buffer.ts';

/** When to use: `new NetworkInterceptor` — the buffers the events write into. */
export interface CdpEventDeps {
  traffic: TrafficBuffer;
  streams: StreamRegistry;
  messages: StreamMessages;
}

/** When to use: `NetworkInterceptor` — dispatch every debugger message here. */
export class NetworkEvents {
  private readonly deps: CdpEventDeps;

  constructor(deps: CdpEventDeps) {
    this.deps = deps;
  }

  /** Route one CDP message; an unknown method is ignored (the debugger reports plenty). */
  async handle(target: BrowserTarget, method: string, params: any): Promise<void> {
    if (method === 'Network.requestWillBeSent') return this.requestStarted(params);
    if (method === 'Network.responseReceived') return this.responseReceived(params);
    if (method === 'Network.loadingFinished') return await this.loadingFinished(target, params);
    if (method.startsWith('Network.webSocket')) return this.webSocket(method, params);
    if (method === 'Network.eventSourceMessageReceived') return this.eventSource(params);
  }

  /** A request started: record it (and prune the oldest). */
  private requestStarted(params: any): void {
    this.deps.traffic.start(params.requestId, params.request, params.type);
  }

  /** Headers and status arrived: complete the record. */
  private responseReceived(params: any): void {
    this.deps.traffic.responded(params.requestId, params.response);
  }

  /**
   * The request finished: keep the body only when it is worth the memory (XHR/Fetch, or a
   * text-ish mime type). Redirects, 304s and preflights have none, so a failure here is normal.
   */
  private async loadingFinished(target: BrowserTarget, params: any): Promise<void> {
    const captured = this.deps.traffic.get(params.requestId);
    if (!captured) return;

    const isXhrOrFetch = captured.resourceType === 'XHR' || captured.resourceType === 'Fetch';
    const isJsonOrText =
      captured.mimeType?.includes('json') ||
      captured.mimeType?.includes('text') ||
      captured.mimeType?.includes('javascript') ||
      captured.mimeType?.includes('xml');
    if (!isXhrOrFetch && !isJsonOrText) return;

    try {
      const body = await target.sendCommand<{ body?: string; base64Encoded?: boolean }>(
        'Network.getResponseBody',
        { requestId: params.requestId },
      );
      if (body && body.body) {
        this.deps.traffic.keepBody(params.requestId, body.body, body.base64Encoded || false);
      }
    } catch {
      // Some responses (redirects, 304s, CORS preflights) don't have bodies.
    }
  }

  /** The five websocket events: open, close, error and the two frames. */
  private webSocket(method: string, params: any): void {
    const { requestId } = params;
    if (method === 'Network.webSocketCreated') {
      this.deps.streams.openWebSocket(requestId, params.url);
    } else if (method === 'Network.webSocketClosed') {
      this.deps.streams.close(requestId);
    } else if (method === 'Network.webSocketFrameSent') {
      this.frame(requestId, 'websocket', 'sent', params.response);
    } else if (method === 'Network.webSocketFrameReceived') {
      this.frame(requestId, 'websocket', 'received', params.response);
    } else if (method === 'Network.webSocketFrameError') {
      this.deps.streams.markError(requestId);
    }
  }

  /** An SSE event: open the feed if this is the first one, then log the frame. */
  private eventSource(params: any): void {
    const { requestId, eventName, eventId, data } = params;
    const known = this.deps.traffic.get(requestId);
    this.deps.streams.ensureSse(requestId, known?.url || 'event-source-stream');
    this.deps.messages.record({
      streamId: requestId,
      streamType: 'sse',
      direction: 'received',
      data,
      eventName,
      eventId,
    });
  }

  /** Count a frame on its stream, then log it. */
  private frame(streamId: string, streamType: 'websocket' | 'sse', direction: 'sent' | 'received', response: any): void {
    this.deps.streams.bump(streamId, direction);
    this.deps.messages.record({
      streamId,
      streamType,
      direction,
      data: response?.payloadData || '',
      opcode: response?.opcode,
    });
  }
}
