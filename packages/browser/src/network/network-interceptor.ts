/**
 * Network inspection: the CDP listener attached to a tab, the captured traffic, the response
 * bodies and the websocket/SSE streams it observes.
 *
 * Why this file is small: `cdp-events.ts` routes the nine CDP events, `traffic-buffer.ts` owns the
 * request/payload store and its filter, `stream-registry.ts` the connection lifecycle and
 * `stream-messages.ts` the rolling frame log. This class attaches the debugger and exposes the
 * agent-facing reads.
 */
import type { BrowserTarget } from '../target.ts';
import { NetworkEvents } from './cdp-events.ts';
import { StreamMessages } from './stream-messages.ts';
import { StreamRegistry } from './stream-registry.ts';
import { TrafficBuffer } from './traffic-buffer.ts';
import type { CapturedNetworkRequest, NetworkFilter, RealtimeStream, StreamMessage } from './types.ts';
/** When to use: the chassis network surface — one interceptor per app. */
export class NetworkInterceptor {
  private readonly attached = new Map<string, () => void>();

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

  /** Attach the CDP network listener to a target (idempotent per adapter identity). */
  public attach(target: BrowserTarget): void {
    if (!target) return;
    const key = `${target.kind}:${target.id}`;
    if (this.attached.has(key)) return;

    try {
      target.ensureAttached?.();
      void target
        .sendCommand('Network.enable', {
          maxPostDataSize: 65536,
          maxResourceBufferSize: 10485760,
        })
        .catch(() => undefined);

      const offEvents = target.onCdpEvent((event) => {
        if (!event.method.startsWith('Network.')) return;
        void this.events.handle(target, event.method, event.params).catch(() => undefined);
      });
      const offDetach = target.onDetach?.(() => this.detach(target));

      this.attached.set(key, () => {
        offEvents();
        offDetach?.();
      });
    } catch (err: any) {
      console.warn(`[NetworkInterceptor] Could not attach CDP debugger: ${err?.message || err}`);
    }
  }

  /** Stop listening to a target; the host calls this when a tab closes or the debugger detaches. */
  public detach(target: BrowserTarget): void {
    const key = `${target.kind}:${target.id}`;
    const off = this.attached.get(key);
    if (!off) return;
    off();
    this.attached.delete(key);
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
