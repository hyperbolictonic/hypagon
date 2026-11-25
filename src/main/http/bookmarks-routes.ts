/**
 * The bridge's `/bookmarks` routes — the Cortex bookmark store.
 *
 * Why a module: four handlers that all begin with the same two steps — get the
 * cortex and pull the request's filters — and each then called the store
 * directly. One table keeps the query-parameter contract (q/tag/limit, url)
 * visible next to the body contract of the write routes.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type BookmarkHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const ROUTES: Record<string, BookmarkHandler> = {
  'GET /bookmarks': async ({ chassis, url, sendJson }) => {
    const limitParam = url.searchParams.get('limit');
    const bookmarks = await chassis.cortex.listBookmarks({
      query: url.searchParams.get('q') || undefined,
      tag: url.searchParams.get('tag') || undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
    });
    sendJson({ success: true, bookmarks });
  },

  'POST /bookmarks/add': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const activeUrl = chassis.tabs.getTabsSummary().find((t) => t.isActive)?.url || 'about:blank';
    const bookmark = await chassis.cortex.addBookmark({
      url: body.url || activeUrl,
      title: body.title,
      notes: body.notes,
      tags: body.tags,
    });
    sendJson({ success: true, bookmark });
  },

  'POST /bookmarks/delete': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const deleted = await chassis.cortex.deleteBookmark(body.urlOrId);
    sendJson({ success: true, deleted });
  },

  'GET /bookmarks/check': async ({ chassis, url, sendJson }) => {
    const isBookmarked = await chassis.cortex.isBookmarked(url.searchParams.get('url') || '');
    sendJson({ success: true, isBookmarked });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/bookmarks`. Returns
 * false when the method+path pair is not a bookmark route.
 */
export async function handleBookmarkRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
