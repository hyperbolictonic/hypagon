/**
 * The bridge's `/jev/*` routes — Just-Enough-View page compaction.
 *
 * Why a module: the four routes are the whole JEV surface (stats, index, read,
 * search) and each reads its arguments out of a different carrier (none, none,
 * body with two spellings of the section id, body query). The table keeps those
 * argument contracts in one view.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type JevHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const ROUTES: Record<string, JevHandler> = {
  'GET /jev/stats': ({ chassis, sendJson }) => {
    sendJson({ success: true, ...chassis.jev.funnel.snapshot(), status: chassis.jev.getStatus() });
  },

  'GET /jev/index': async ({ chassis, sendJson }) => {
    sendJson(await chassis.jev.store.index());
  },

  'POST /jev/read': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const sectionId = String(body.section_id ?? body.sectionId ?? '');
    const includeChildren = body.include_children === true || body.includeChildren === true;
    sendJson(chassis.jev.store.readSection(sectionId, includeChildren));
  },

  'POST /jev/search': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson(chassis.jev.store.search(String(body.query ?? '')));
  },
};

/**
 * When to use: the bridge request handler — dispatch `/jev/*`. Returns false
 * when the method+path pair is not a JEV route.
 */
export async function handleJevRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
