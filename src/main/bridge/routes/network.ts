/**
 * Network and capture routes: HTTP traffic, API payloads, realtime streams, HAR
 * export and the shared capture-buffer reset.
 *
 * The traffic buffer is process state, so `since: "last_action"` resolves against
 * the bridge's last mutating action rather than the wall clock.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import fs from 'node:fs';
import path from 'node:path';
import { dataPath } from '../../data-paths.js';
import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/** Read the buffer once, then apply the optional `since` cut. */
function respondTraffic(ctx: BridgeContext, filter: any): void {
  let traffic = ctx.chassis.getNetworkTraffic(filter);
  const since = filter?.since === 'last_action' ? ctx.lastActionAt : Number(filter?.since);
  if (since && !isNaN(since)) {
    traffic = traffic.filter((row) => (row.requestTime || 0) >= since);
  }
  ctx.json({ success: true, count: traffic.length, traffic });
}

const ROUTES: Record<string, Handler> = {
  'GET /network/traffic': async (ctx) => {
    respondTraffic(ctx, undefined);
  },

  'POST /network/traffic': async (ctx) => {
    respondTraffic(ctx, await ctx.body());
  },

  'POST /network/payload': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, payload: ctx.chassis.network.payload(body.requestId) });
  },

  'POST /network/clear': async (ctx) => {
    ctx.chassis.clearNetworkTraffic();
    ctx.json({ success: true, message: 'Network traffic buffer cleared' });
  },

  'POST /network/har': async (ctx) => {
    const body = await ctx.body();
    const har = ctx.chassis.getPrimitives().exportHar({
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      pattern: body?.pattern,
    });
    if (body?.save) {
      const dir = dataPath('har');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `har_${Date.now()}.har`);
      fs.writeFileSync(file, JSON.stringify(har, null, 2));
      ctx.json({ success: true, entries: har.log.entries.length, filePath: file });
      return;
    }
    ctx.json({ success: true, entries: har.log.entries.length, har });
  },

  'GET /streams/list': async (ctx) => {
    ctx.json({ success: true, streams: ctx.chassis.getRealtimeStreams({}) });
  },

  'POST /streams/list': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, streams: ctx.chassis.getRealtimeStreams(body) });
  },

  'POST /streams/messages': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, messages: ctx.chassis.getStreamMessages(body) });
  },

  'POST /streams/clear': async (ctx) => {
    const body = await ctx.body();
    ctx.chassis.clearStreamMessages(body.streamId);
    ctx.json({ success: true, message: 'Stream message buffer cleared' });
  },

  'POST /capture/clear': async (ctx) => {
    const body = await ctx.body();
    const scope = body?.scope || 'all';
    const cleared: string[] = [];
    if (scope === 'all' || scope === 'network') {
      ctx.chassis.clearNetworkTraffic();
      cleared.push('network');
    }
    if (scope === 'all' || scope === 'streams') {
      ctx.chassis.clearStreamMessages();
      cleared.push('streams');
    }
    ctx.json({
      success: true,
      cleared,
      message: cleared.length > 0 ? `Cleared capture buffer(s): ${cleared.join(', ')}` : 'Unknown scope; nothing cleared',
    });
  },
};

/** When to use: the request reads or clears network traffic, streams or capture buffers. */
export async function handleNetworkRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
