/**
 * The bridge's `/network/*` routes — the traffic buffer and HAR export.
 *
 * Why a module: the family reads the buffer through the chassis, but its
 * `since: 'last_action'` filter needs a value the bridge owns and mutates on
 * every agent action, so that timestamp arrives as a getter. The HAR route's
 * "save to the har directory" variant is kept next to the inline answer.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';
import { dataPath } from '../data-paths.js';

/** When to use: building the network dispatcher — the bridge supplies the moving timestamp. */
export interface NetworkRouteContext extends ChassisRouteContext {
  /** Current `lastActionAt`; read through the getter, never cached. */
  lastActionAt: () => number;
}

type NetworkHandler = (ctx: NetworkRouteContext) => Promise<void> | void;

/**
 * The traffic filter is shared because agents reach it both ways: the MCP tool
 * posts a body, curl and the devtools pages GET it.
 */
const trafficHandler: NetworkHandler = async ({ chassis, method, readBody, sendJson, lastActionAt }) => {
  const filter = method === 'POST' ? await readBody() : undefined;
  let traffic = chassis.network.traffic(filter);
  if (filter) {
    const since = filter.since === 'last_action' ? lastActionAt() : Number(filter.since);
    if (since && !Number.isNaN(since)) {
      traffic = traffic.filter((entry) => (entry.requestTime || 0) >= since);
    }
  }
  sendJson({ success: true, count: traffic.length, traffic });
};

const ROUTES: Record<string, NetworkHandler> = {
  'GET /network/traffic': trafficHandler,
  'POST /network/traffic': trafficHandler,

  'POST /network/payload': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, payload: chassis.network.payload(body.requestId) });
  },

  'POST /network/clear': ({ chassis, sendJson }) => {
    chassis.network.clear();
    sendJson({ success: true, message: 'Network traffic buffer cleared' });
  },

  'POST /network/har': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const har = chassis.getPrimitives().exportHar({
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      pattern: body?.pattern,
    });
    if (body?.save) {
      const dir = dataPath('har');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `har_${Date.now()}.har`);
      fs.writeFileSync(file, JSON.stringify(har, null, 2));
      sendJson({ success: true, entries: har.log.entries.length, filePath: file });
      return;
    }
    sendJson({ success: true, entries: har.log.entries.length, har });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/network/*`. Returns
 * false when the method+path pair is not a network route.
 */
export async function handleNetworkRoutes(ctx: NetworkRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
