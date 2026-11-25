/**
 * The bridge's session-vault routes: `/session/*` and its `/context/*` aliases.
 *
 * Why one module: the named-context endpoints are documented as thin aliases
 * over the same chassis session vault — same calls, different response keys and
 * (for `open`) an extra required-name check. The table below spells the alias
 * relationship out once per route; the handlers are shared so the two spellings
 * cannot drift.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type SessionHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const save: SessionHandler = async ({ chassis, readBody, sendJson }) => {
  const body = await readBody();
  sendJson({ success: true, result: await chassis.sessions.save(body?.name) });
};

const restore: SessionHandler = async ({ chassis, readBody, sendJson }) => {
  const body = await readBody();
  sendJson({ success: true, result: await chassis.sessions.restore(body.name) });
};

const open: SessionHandler = async ({ chassis, readBody, sendJson }) => {
  const body = await readBody();
  if (!body?.name) {
    sendJson({ success: false, error: 'Provide { name }', code: 'BAD_REQUEST' }, 400);
    return;
  }
  sendJson({ success: true, result: await chassis.sessions.restore(body.name) });
};

const list = (key: 'sessions' | 'contexts'): SessionHandler => ({ chassis, sendJson }) => {
  sendJson({ success: true, [key]: chassis.sessions.list() });
};

const remove: SessionHandler = async ({ chassis, readBody, sendJson }) => {
  const body = await readBody();
  sendJson({ success: true, deleted: chassis.sessions.remove(body?.name) });
};

const ROUTES: Record<string, SessionHandler> = {
  'POST /session/save': save,
  'POST /context/save': save,

  'POST /session/restore': restore,
  'POST /context/open': open,

  'GET /session/list': list('sessions'),
  'GET /context/list': list('contexts'),

  'POST /session/delete': remove,
  'POST /context/delete': remove,
};

/**
 * When to use: the bridge request handler — dispatch `/session/*` and the
 * `/context/*` aliases. Returns false when the method+path pair is not a
 * session-vault route.
 */
export async function handleSessionRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
