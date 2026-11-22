/**
 * The bridge's `/hil/*` routes — human-in-the-loop interventions.
 *
 * Why a module: the request/resolve/cancel/active/history pair is one lifecycle;
 * keeping it in one table makes the cycle readable and gives the notification
 * surface's neighbours a stable home.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type HilHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const ROUTES: Record<string, HilHandler> = {
  'POST /hil/request': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const result = await chassis.requestHumanIntervention(body.reason, {
      url: body.url,
      timeoutSeconds: body.timeoutSeconds,
      bringToFront: body.bringToFront,
    });
    sendJson({ success: true, result });
  },

  'POST /hil/resolve': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, resolved: chassis.resolveHumanIntervention(body.id, body.notes) });
  },

  'POST /hil/cancel': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, cancelled: chassis.cancelHumanIntervention(body.id) });
  },

  'GET /hil/active': ({ chassis, sendJson }) => {
    sendJson({ success: true, active: chassis.getActiveHumanIntervention() });
  },

  'GET /hil/history': ({ chassis, sendJson }) => {
    sendJson({ success: true, history: chassis.getHumanInterventionHistory() });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/hil/*`. Returns false
 * when the method+path pair is not an intervention route.
 */
export async function handleHumanInterventionRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
