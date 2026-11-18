/**
 * Memory routes: Cortex recall/history/suggestions and bookmarks.
 *
 * Both surfaces are thin views over the Cortex store; handlers only parse query
 * parameters and map the result.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/** `parseInt` only for a present query parameter; absent stays undefined. */
function queryInt(ctx: BridgeContext, name: string): number | undefined {
  const raw = ctx.url.searchParams.get(name);
  return raw ? parseInt(raw, 10) : undefined;
}

const ROUTES: Record<string, Handler> = {
  'POST /cortex/recall': async (ctx) => {
    const body = await ctx.body();
    const results = await ctx.chassis.getCortex().recall(body.query, { limit: body.limit, domain: body.domain });
    ctx.json({ success: true, results });
  },

  'GET /cortex/history': async (ctx) => {
    const history = await ctx.chassis.getCortex().getHistory({
      limit: queryInt(ctx, 'limit'),
      domain: ctx.url.searchParams.get('domain') || undefined,
    });
    ctx.json({ success: true, history });
  },

  'GET /cortex/suggest': async (ctx) => {
    const suggestions = await ctx.chassis.getCortex().suggestUrls(ctx.url.searchParams.get('q') || '', {
      limit: queryInt(ctx, 'limit'),
      semantic: ctx.url.searchParams.get('semantic') !== 'false',
    });
    ctx.json({ success: true, suggestions });
  },

  'POST /cortex/history/clear': async (ctx) => {
    const body = await ctx.body();
    await ctx.chassis.getCortex().clearHistory(body.olderThan);
    ctx.json({ success: true, message: 'History cleared' });
  },

  'GET /bookmarks': async (ctx) => {
    const bookmarks = await ctx.chassis.getCortex().listBookmarks({
      query: ctx.url.searchParams.get('q') || undefined,
      tag: ctx.url.searchParams.get('tag') || undefined,
      limit: queryInt(ctx, 'limit'),
    });
    ctx.json({ success: true, bookmarks });
  },

  'POST /bookmarks/add': async (ctx) => {
    const body = await ctx.body();
    const cortex = ctx.chassis.getCortex();
    const activeUrl = ctx.chassis.getTabsSummary().find((tab) => tab.isActive)?.url || 'about:blank';
    const bookmark = await cortex.addBookmark({
      url: body.url || activeUrl,
      title: body.title,
      notes: body.notes,
      tags: body.tags,
    });
    ctx.json({ success: true, bookmark });
  },

  'POST /bookmarks/delete': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, deleted: await ctx.chassis.getCortex().deleteBookmark(body.urlOrId) });
  },

  'GET /bookmarks/check': async (ctx) => {
    const isBookmarked = await ctx.chassis.getCortex().isBookmarked(ctx.url.searchParams.get('url') || '');
    ctx.json({ success: true, isBookmarked });
  },
};

/** When to use: the request targets Cortex memory or bookmarks; false leaves it to other families. */
export async function handleMemoryRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
