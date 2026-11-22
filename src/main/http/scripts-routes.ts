/**
 * The bridge's `/scripts` routes — the script vault (save, recall, run, list,
 * delete).
 *
 * Why a module: five thin handlers that all read a name/query out of the
 * request and hand it to the chassis, plus `recall` which serves the same
 * operation from either a JSON body or a query string. Keeping them together
 * makes that dual input visible instead of one branch inside a 1600-line
 * handler.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type ScriptHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** `recall` accepts the same filters from a POST body or a GET query string. */
const recallScripts = async ({ chassis, method, url, readBody, sendJson }: ChassisRouteContext) => {
  const body = method === 'POST' ? await readBody() : {};
  const scripts = await chassis.recallScripts(body.query, {
    domain: body.domain,
    tag: body.tag,
    limit: body.limit,
  });
  sendJson({ success: true, scripts });
};

const ROUTES: Record<string, ScriptHandler> = {
  'POST /scripts/save': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, script: await chassis.saveScript(body) });
  },

  // Explicit registry variants: the tool layer calls recall with a body.
  'POST /scripts/recall': recallScripts,
  'GET /scripts/recall': recallScripts,

  'POST /scripts/run': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, execution: await chassis.runScript(body.name, body.args) });
  },

  'GET /scripts/list': async ({ chassis, url, sendJson }) => {
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    // Tree search when a query is present, otherwise enumerate
    // (recallScripts lists all when query is undefined).
    const scripts = await chassis.recallScripts(url.searchParams.get('q') || undefined, {
      tag: url.searchParams.get('tag') || undefined,
      limit,
    });
    sendJson({ success: true, scripts });
  },

  'POST /scripts/delete': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, deleted: await chassis.deleteScript(body.name) });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/scripts/*`. Returns
 * false when the method+path pair is not a script route.
 */
export async function handleScriptRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
