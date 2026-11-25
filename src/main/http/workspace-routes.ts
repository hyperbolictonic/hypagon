/**
 * The bridge's zoom and viewport routes.
 *
 * Why one module: both surfaces answer a GET with the current state and a POST
 * with the state after a validated change, and both reject an out-of-range
 * factor/size with the same `{ success: false, code: 'BAD_REQUEST' }` body.
 * Keeping the pair together is what makes the validation rule auditable; the
 * main handler only has to dispatch.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type WorkspaceHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const ROUTES: Record<string, WorkspaceHandler> = {
  'GET /zoom': ({ chassis, sendJson }) => {
    sendJson({ success: true, zoom: chassis.getZoomState() });
  },

  'POST /zoom': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const action =
      body?.action === 'in' || body?.action === 'out' || body?.action === 'reset' || body?.action === 'status'
        ? body.action
        : 'status';
    const factor = body?.factor !== undefined ? Number(body.factor) : undefined;
    if (body?.action === 'set' && factor === undefined) {
      sendJson({ success: false, error: 'action "set" requires a numeric factor.', code: 'BAD_REQUEST' }, 400);
      return;
    }
    if (factor !== undefined && (!Number.isFinite(factor) || factor < 0.25 || factor > 5)) {
      sendJson({ success: false, error: 'factor must be between 0.25 and 5.', code: 'BAD_REQUEST' }, 400);
      return;
    }
    const zoom = chassis.setZoom({ action, factor });
    sendJson({ success: true, zoom });
  },

  'GET /viewport': ({ chassis, sendJson }) => {
    sendJson({ success: true, viewport: chassis.getViewportState() });
  },

  'POST /viewport': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const requested =
      body?.action === 'reset' || body?.action === 'rotate' || body?.action === 'set' || body?.action === 'status'
        ? body.action
        : body?.preset !== undefined || body?.width !== undefined
          ? 'set'
          : 'status';
    try {
      const viewport = await chassis.setViewport({
        action: requested,
        preset: typeof body?.preset === 'string' ? body.preset : undefined,
        width: body?.width !== undefined ? Number(body.width) : undefined,
        height: body?.height !== undefined ? Number(body.height) : undefined,
        deviceScaleFactor:
          body?.device_scale_factor !== undefined
            ? Number(body.device_scale_factor)
            : body?.deviceScaleFactor !== undefined
              ? Number(body.deviceScaleFactor)
              : undefined,
        mobile: typeof body?.mobile === 'boolean' ? body.mobile : undefined,
        touch: typeof body?.touch === 'boolean' ? body.touch : undefined,
      });
      sendJson({ success: true, viewport });
    } catch (error: any) {
      sendJson({ success: false, error: error?.message || String(error), code: 'BAD_REQUEST' }, 400);
    }
  },
};

/**
 * When to use: the bridge request handler — dispatch `/zoom` and `/viewport`.
 * Returns false when the method+path pair is not a workspace route.
 */
export async function handleWorkspaceRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
