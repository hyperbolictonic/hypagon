/**
 * The bridge's session-vault routes: `/session/*` and its `/context/*` aliases.
 *
 * Why one module: the named-context endpoints are documented as thin aliases
 * over the same chassis session vault — same calls, different response keys and
 * (for `open`) an extra required-name check. Keeping both spellings side by side
 * is what makes the alias relationship auditable; separating them would invite
 * the two to drift again.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type SessionHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const ROUTES: Record<string, SessionHandler> = {
  'POST /session/save': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, result: await chassis.saveSession(body.name) });
  },

  'POST /session/restore': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, result: await chassis.restoreSession(body.name) });
  },

  'GET /session/list': ({ chassis, sendJson }) => {
    sendJson({ success: true, sessions: chassis.listSessions() });
  },

  'POST /session/delete': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, deleted: chassis.deleteSession(body.name) });
  },

  'POST /context/save': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, result: await chassis.saveSession(body?.name) });
  },

  'POST /context/open': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    if (!body?.name) {
      sendJson({ success: false, error: 'Provide { name }', code: 'BAD_REQUEST' }, 400);
      return;
    }
    sendJson({ success: true, result: await chassis.restoreSession(body.name) });
  },

  'GET /context/list': ({ chassis, sendJson }) => {
    sendJson({ success: true, contexts: chassis.listSessions() });
  },

  'POST /context/delete': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, deleted: chassis.deleteSession(body?.name) });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/session/*` and the
 * `/context/*` aliases. Returns false when the method+path pair is not a
 * session-vault route.
 */
export async function handleSessionRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
