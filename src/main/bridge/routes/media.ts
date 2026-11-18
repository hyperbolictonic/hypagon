/**
 * Media routes (`/media/*`).
 *
 * All handlers require the media service; a missing service is a 503 rather than
 * a crash, so the bridge stays usable in builds without media support.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import type { BridgeContext } from '../context.js';
import { dispatchRouteTable, type TableHandler } from '../dispatch.js';

type Handler = TableHandler;

/** Media operations share one result envelope: `{ success, ...result }` plus the ok status. */
function respondResult(ctx: BridgeContext, result: { ok: boolean }): void {
  ctx.json(result.ok ? { success: true, ...result } : { success: false, ...result }, result.ok ? 200 : 400);
}

/** Transcript and preview accept the same language and character budget. */
function readOptions(body: any): { lang?: string; maxChars?: number } {
  return {
    lang: typeof body?.lang === 'string' ? body.lang : undefined,
    maxChars: typeof body?.maxChars === 'number' ? body.maxChars : undefined,
  };
}

const ROUTES: Record<string, Handler> = {
  'GET /media/status': async (ctx) => {
    try {
      ctx.json({ success: true, ...(await ctx.media!.status()) });
    } catch (error) {
      ctx.json(
        {
          success: false,
          code: 'MEDIA_UNAVAILABLE',
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },

  'POST /media/info': async (ctx) => {
    const body = await ctx.body();
    respondResult(ctx, await ctx.media!.info(typeof body?.url === 'string' ? body.url : ''));
  },

  'POST /media/download': async (ctx) => {
    const body = await ctx.body();
    respondResult(ctx, await ctx.media!.download({
      url: typeof body?.url === 'string' ? body.url : '',
      kind: body?.kind === 'audio' ? 'audio' : body?.kind === 'video' ? 'video' : undefined,
      quality: typeof body?.quality === 'string' ? body.quality : undefined,
    }));
  },

  'GET /media/jobs': async (ctx) => {
    const media = ctx.media!;
    ctx.json({ success: true, jobs: media.jobs.list(), counts: media.jobs.counts() });
  },

  'POST /media/cancel': async (ctx) => {
    const body = await ctx.body();
    const id = typeof body?.id === 'string' ? body.id : '';
    const result = ctx.media!.cancel(id);
    ctx.json({ success: result.ok, ...result });
  },

  'GET /media/library': async (ctx) => {
    const jobs = ctx.media!.library();
    ctx.json({
      success: true,
      count: jobs.length,
      bytes: jobs.reduce((total, job) => total + job.files.reduce((sum, file) => sum + file.bytes, 0), 0),
      jobs,
    });
  },

  'POST /media/transcript': async (ctx) => {
    const body = await ctx.body();
    respondResult(ctx, await ctx.media!.transcript(typeof body?.url === 'string' ? body.url : '', {
      ...readOptions(body),
      cursor: typeof body?.cursor === 'number' ? body.cursor : undefined,
      index: body?.index !== false,
    }));
  },

  'POST /media/preview': async (ctx) => {
    const body = await ctx.body();
    respondResult(ctx, await ctx.media!.preview(typeof body?.url === 'string' ? body.url : '', {
      ...readOptions(body),
      thumbnail: body?.thumbnail !== false,
    }));
  },
};

/** When to use: the request targets `/media/*`; returns false for other paths. */
export async function handleMediaRoutes(ctx: BridgeContext): Promise<boolean> {
  if (!ctx.pathname.startsWith('/media/')) return false;
  if (!ctx.media) {
    ctx.fail('Media is not initialised.', 503, 'MEDIA_UNAVAILABLE');
    return true;
  }
  return await dispatchRouteTable(ctx, ROUTES, ctx.pathname, 'Media endpoint not found.');
}
