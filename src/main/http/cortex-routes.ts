/**
 * The bridge's `/cortex/*` routes — the semantic memory store (recall, history,
 * suggestions) minus the bookmarks, which live in bookmarks-routes.
 *
 * Why a module: the four handlers all begin with the same two steps — get the
 * cortex, parse a `limit` — and each then parsed its query shape inline. The
 * table keeps the query-parameter contracts side by side.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type CortexHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** `limit` arrives as a string in query parameters, a number in a body. */
const limitOf = (value: unknown): number | undefined => (value ? parseInt(String(value), 10) : undefined);

const ROUTES: Record<string, CortexHandler> = {
  'POST /cortex/recall': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const results = await chassis.cortex.history.recall(body.query, { limit: body.limit, domain: body.domain });
    sendJson({ success: true, results });
  },

  'GET /cortex/history': async ({ chassis, url, sendJson }) => {
    const history = await chassis.cortex.history.getHistory({
      limit: limitOf(url.searchParams.get('limit')),
      domain: url.searchParams.get('domain') || undefined,
    });
    sendJson({ success: true, history });
  },

  'GET /cortex/suggest': async ({ chassis, url, sendJson }) => {
    const suggestions = await chassis.cortex.history.suggestUrls(url.searchParams.get('q') || '', {
      limit: limitOf(url.searchParams.get('limit')),
      semantic: url.searchParams.get('semantic') !== 'false',
    });
    sendJson({ success: true, suggestions });
  },

  'POST /cortex/history/clear': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    await chassis.cortex.history.clearHistory(body.olderThan);
    sendJson({ success: true, message: 'History cleared' });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/cortex/*`. Returns false
 * when the method+path pair is not a memory route.
 */
export async function handleCortexRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
