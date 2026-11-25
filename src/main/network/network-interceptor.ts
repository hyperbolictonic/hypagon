/**
 * Network inspection: the CDP listener attached to a tab, the captured traffic, the response
 * bodies and the websocket/SSE streams it observes.
 *
 * Why this file is small: `cdp-events.ts` routes the nine CDP events, `traffic-buffer.ts` owns the
 * request/payload store and its filter, `stream-registry.ts` the connection lifecycle and
 * `stream-messages.ts` the rolling frame log. This class attaches the debugger and exposes the
 * agent-facing reads.
 */
import type { WebContents } from 'electron';
import { NetworkEvents } from './cdp-events.js';
import { StreamMessages } from './stream-messages.js';
import { StreamRegistry } from './stream-registry.js';
import { TrafficBuffer } from './traffic-buffer.js';
import type { CapturedNetworkRequest, NetworkFilter, RealtimeStream, StreamMessage } from './types.js';
/** When to use: the chassis network surface — one interceptor per app. */
export class NetworkInterceptor {
  private readonly attachedWebContents: Set<WebContents> = new Set();

  /** The request/payload store. */
  readonly traffic = new TrafficBuffer();
  /** The websocket/SSE connection registry. */
  readonly streams = new StreamRegistry();
  /** The rolling frame log. */
  readonly messages = new StreamMessages();

  private readonly events = new NetworkEvents({
    traffic: this.traffic,
    streams: this.streams,
    messages: this.messages,
  });

  /** Attach the CDP network listener to a tab (idempotent; destroyed tabs are ignored). */
  public attach(wc: WebContents): void {
    if (!wc || wc.isDestroyed() || this.attachedWebContents.has(wc)) return;

    try {
      if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');

      wc.debugger.sendCommand('Network.enable', {
        maxPostDataSize: 65536,
        maxResourceBufferSize: 10485760,
      });

      this.attachedWebContents.add(wc);

      wc.debugger.on('message', async (_event, method, params) => {
        try {
          await this.events.handle(wc, method, params);
        } catch {
          // Ignore transient CDP errors.
        }
      });

      wc.debugger.on('detach', () => {
        this.attachedWebContents.delete(wc);
      });

      wc.on('destroyed', () => {
        this.attachedWebContents.delete(wc);
      });
    } catch (err: any) {
      console.warn(`[NetworkInterceptor] Could not attach CDP debugger: ${err?.message || err}`);
    }
  }

  /** Filtered captured requests, newest first. */
  public getTraffic(filter?: NetworkFilter): CapturedNetworkRequest[] {
    return this.traffic.list(filter);
  }

  /** The decoded response body for a request. */
  public getPayload(requestId: string): {
    requestId: string;
    url?: string;
    status?: number;
    mimeType?: string;
    isJson: boolean;
    data: any;
  } {
    return this.traffic.payload(requestId);
  }

  /** Clears in-memory request, payload and stream buffers. */
  public clear(): void {
    this.traffic.clear();
    this.streams.clear();
    this.messages.clear();
  }

  /** Observed websocket connections and SSE feeds, most recently active first. */
  public getStreams(options?: { type?: 'websocket' | 'sse'; activeOnly?: boolean }): RealtimeStream[] {
    return this.streams.list(options);
  }

  /** Rolling real-time stream messages and frames. */
  public getStreamMessages(options?: {
    streamId?: string;
    type?: 'websocket' | 'sse';
    direction?: 'sent' | 'received';
    limit?: number;
  }): StreamMessage[] {
    return this.messages.list(options);
  }

  /** Clears streaming message buffers (one stream, or all). */
  public clearStreamMessages(streamId?: string): void {
    this.messages.clear(streamId);
  }
}
