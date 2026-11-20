/**
 * WebSocket / SSE capture: stream lifecycle and the rolling message buffer.
 *
 * The interceptor feeds CDP events here; the bridge routes read the buffers. Kept
 * apart from HTTP request capture so each has one buffer, one cap and one clear path.
 *
 * When to use: recording a websocket/SSE event, or serving `GET /streams/list` and
 * `POST /streams/messages`. HTTP traffic lives in network-interceptor.ts.
 */

/** When to use: listing a detected websocket/SSE stream and its message counts. */
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

/** When to use: reading one captured stream message (direction, payload, time). */
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

/** When to use: filtering the stream message buffer by stream, type or direction. */
export interface StreamMessageFilter {
  streamId?: string;
  type?: 'websocket' | 'sse';
  direction?: 'sent' | 'received';
  limit?: number;
}

/** When to use: filtering the stream list by protocol or open state. */
export interface StreamListFilter {
  type?: 'websocket' | 'sse';
  activeOnly?: boolean;
}

/**
 * When to use: the interceptor records CDP stream events here, and the bridge reads
 * them. One instance per interceptor; the message buffer is a rolling cap.
 */
export class StreamCapture {
  private streams = new Map<string, RealtimeStream>();
  private messages: StreamMessage[] = [];
  private counter = 0;

  constructor(private readonly maxMessages: number = 500) {}

  /** One fresh stream entry; the only place its counters start at zero. */
  private createStream(streamId: string, type: 'websocket' | 'sse', url: string): RealtimeStream {
    const now = Date.now();
    return {
      streamId,
      type,
      url,
      status: 'open',
      createdAt: now,
      framesSentCount: 0,
      framesReceivedCount: 0,
      lastActivity: now,
    };
  }

  /** When to use: `Network.webSocketCreated` — always (re)creates the stream entry. */
  public openWebSocket(streamId: string, url: string): void {
    this.streams.set(streamId, this.createStream(streamId, 'websocket', url));
  }

  /** When to use: `Network.eventSourceMessageReceived` before the first frame — creates once. */
  public ensureSse(streamId: string, url: string): void {
    if (this.streams.has(streamId)) return;
    this.streams.set(streamId, this.createStream(streamId, 'sse', url));
  }

  /** When to use: `Network.webSocketClosed`. */
  public close(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.status = 'closed';
    stream.closedAt = Date.now();
    stream.lastActivity = Date.now();
  }

  /** When to use: `Network.webSocketFrameError`. */
  public markError(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream) stream.status = 'error';
  }

  /** When to use: recording one websocket frame or SSE message, parsed when it is JSON. */
  public record(
    streamId: string,
    streamType: 'websocket' | 'sse',
    direction: 'sent' | 'received',
    data: string,
    opcode?: number,
    eventName?: string,
    eventId?: string,
  ): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      if (direction === 'sent') stream.framesSentCount++;
      else stream.framesReceivedCount++;
      stream.lastActivity = Date.now();
    }

    let isJson = false;
    let jsonData: any = undefined;
    const trimmed = (data || '').trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        jsonData = JSON.parse(trimmed);
        isJson = true;
      } catch {}
    }

    this.messages.push({
      id: `msg_${++this.counter}`,
      streamId,
      streamType,
      direction,
      timestamp: Date.now(),
      opcode,
      eventName,
      eventId,
      data,
      isJson,
      jsonData,
    });
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
  }

  /** When to use: `GET /streams/list` — newest activity first, optionally filtered. */
  public list(options?: StreamListFilter): RealtimeStream[] {
    let list = Array.from(this.streams.values()).sort((a, b) => b.lastActivity - a.lastActivity);
    if (options?.type) list = list.filter((s) => s.type === options.type);
    if (options?.activeOnly) list = list.filter((s) => s.status === 'open');
    return list;
  }

  /** When to use: `POST /streams/messages` — the last N matching messages. */
  public messagesFor(options?: StreamMessageFilter): StreamMessage[] {
    let list = [...this.messages];
    if (options?.streamId) list = list.filter((m) => m.streamId === options.streamId);
    if (options?.type) list = list.filter((m) => m.streamType === options.type);
    if (options?.direction) list = list.filter((m) => m.direction === options.direction);
    const limit = options?.limit && options.limit > 0 ? options.limit : 50;
    return list.slice(-limit);
  }

  /** When to use: `POST /streams/clear` — one stream's messages, or the whole buffer. */
  public clearMessages(streamId?: string): void {
    if (streamId) {
      this.messages = this.messages.filter((m) => m.streamId !== streamId);
    } else {
      this.messages = [];
    }
  }

  /** When to use: the interceptor's full clear (network + streams). */
  public clear(): void {
    this.streams.clear();
    this.messages = [];
  }
}
