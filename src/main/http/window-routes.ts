/**
 * The bridge's `/window/*` routes — window visibility and the close-to-tray
 * setting.
 *
 * Why a module: `GET` and `POST` `/window/visibility` answer with the same
 * `{ visible, focused }` shape; one builder owns it, so the two never drift
 * apart (the POST handler answers with the state *after* the change).
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type WindowHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** The visibility payload both methods answer with. */
const visibilityState = (chassis: ChassisRouteContext['chassis']) => ({
  success: true,
  visible: chassis.isWindowVisible(),
  focused: chassis.isWindowFocused(),
});

const ROUTES: Record<string, WindowHandler> = {
  'POST /window/visibility': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    chassis.setWindowVisibility(!!body.visible);
    if (body.visible && body.focus !== false) chassis.focusWindow();
    sendJson(visibilityState(chassis));
  },

  'GET /window/visibility': ({ chassis, sendJson }) => {
    sendJson(visibilityState(chassis));
  },

  'POST /window/focus': ({ chassis, sendJson }) => {
    sendJson({ success: true, focused: chassis.focusWindow() });
  },

  'POST /window/tray': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    if (typeof body.closeToTray === 'boolean') {
      chassis.setCloseToTray(body.closeToTray);
    }
    sendJson({ success: true, closeToTray: chassis.isCloseToTray() });
  },

  'GET /window/tray': ({ chassis, sendJson }) => {
    sendJson({ success: true, closeToTray: chassis.isCloseToTray() });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/window/*`. Returns
 * false when the method+path pair is not a window route.
 */
export async function handleWindowRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
