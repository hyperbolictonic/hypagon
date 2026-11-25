/**
 * The live connection registry: one record per websocket or SSE feed, updated by the CDP events.
 *
 * Why a module: opening, closing, erroring and bumping the frame counters are one lifecycle over
 * one map; the frame log is separate because it is a bounded rolling list, not a lookup.
 */
import type { RealtimeStream } from './types.js';

/** When to use: `NetworkInterceptor.streams` — one registry per interceptor. */
export class StreamRegistry {
  private readonly streams = new Map<string, RealtimeStream>();

  /** A websocket was created: open it. */
  openWebSocket(streamId: string, url: string): void {
    this.streams.set(streamId, {
      streamId,
      type: 'websocket',
      url,
      status: 'open',
      createdAt: Date.now(),
      framesSentCount: 0,
      framesReceivedCount: 0,
      lastActivity: Date.now(),
    });
  }

  /** An SSE feed spoke before its stream was seen: open it against the request URL when known. */
  ensureSse(streamId: string, url: string): void {
    if (this.streams.has(streamId)) return;
    this.streams.set(streamId, {
      streamId,
      type: 'sse',
      url,
      status: 'open',
      createdAt: Date.now(),
      framesSentCount: 0,
      framesReceivedCount: 0,
      lastActivity: Date.now(),
    });
  }

  /** A websocket closed cleanly. */
  close(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    stream.status = 'closed';
    stream.closedAt = Date.now();
    stream.lastActivity = Date.now();
  }

  /** A websocket errored. */
  markError(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (stream) stream.status = 'error';
  }

  /** Count one frame in a direction and move the activity clock. */
  bump(streamId: string, direction: 'sent' | 'received'): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;
    if (direction === 'sent') stream.framesSentCount++;
    else stream.framesReceivedCount++;
    stream.lastActivity = Date.now();
  }

  /** Most recently active first, optionally one type and optionally only open streams. */
  list(options?: { type?: 'websocket' | 'sse'; activeOnly?: boolean }): RealtimeStream[] {
    let list = Array.from(this.streams.values()).sort((a, b) => b.lastActivity - a.lastActivity);
    if (options?.type) list = list.filter((s) => s.type === options.type);
    if (options?.activeOnly) list = list.filter((s) => s.status === 'open');
    return list;
  }

  /** Forget every connection. */
  clear(): void {
    this.streams.clear();
  }
}
