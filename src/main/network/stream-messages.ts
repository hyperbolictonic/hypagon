/**
 * The rolling frame log: websocket frames and SSE events, newest last, capped at 500.
 *
 * Why a module: the id counter, the JSON probe and the cap move together, and a reader asks for a
 * tail slice filtered by stream, type and direction — not for the whole log.
 */
import type { StreamMessage } from './types.js';

/** One frame as the CDP router saw it, before the log stamps it. */
export interface FrameInput {
  streamId: string;
  streamType: 'websocket' | 'sse';
  direction: 'sent' | 'received';
  data: string;
  opcode?: number;
  eventName?: string;
  eventId?: string;
}

/** When to use: `NetworkInterceptor.messages` — one log per interceptor. */
export class StreamMessages {
  private messages: StreamMessage[] = [];
  private counter = 0;
  private readonly maxMessages = 500;

  /** Append one frame; the JSON body is parsed when the payload looks like JSON. */
  record(input: FrameInput): void {
    let isJson = false;
    let jsonData: any = undefined;
    const trimmed = (input.data || '').trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        jsonData = JSON.parse(trimmed);
        isJson = true;
      } catch {
        // Not JSON after all; keep the raw frame.
      }
    }

    this.messages.push({
      id: `msg_${++this.counter}`,
      streamId: input.streamId,
      streamType: input.streamType,
      direction: input.direction,
      timestamp: Date.now(),
      opcode: input.opcode,
      eventName: input.eventName,
      eventId: input.eventId,
      data: input.data,
      isJson,
      jsonData,
    });

    if (this.messages.length > this.maxMessages) this.messages.shift();
  }

  /** The last `limit` (default 50) frames matching the filters. */
  list(options?: {
    streamId?: string;
    type?: 'websocket' | 'sse';
    direction?: 'sent' | 'received';
    limit?: number;
  }): StreamMessage[] {
    let list = [...this.messages];
    if (options?.streamId) list = list.filter((m) => m.streamId === options.streamId);
    if (options?.type) list = list.filter((m) => m.streamType === options.type);
    if (options?.direction) list = list.filter((m) => m.direction === options.direction);
    const limit = options?.limit && options.limit > 0 ? options.limit : 50;
    return list.slice(-limit);
  }

  /** Drop one stream's frames, or every frame. */
  clear(streamId?: string): void {
    this.messages = streamId ? this.messages.filter((m) => m.streamId !== streamId) : [];
  }
}
