/**
 * Collaboration routes (`/collaboration/*`).
 *
 * Threads anchor a comment or question to a page target. The target defaults to
 * the active tab and its current URL so the MCP layer can pass only text.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import type { BridgeContext } from '../context.js';
import { dispatchRouteTable, type TableHandler } from '../dispatch.js';

type Handler = TableHandler;

/** Highlight and ask differ only in thread kind; the target/body validation is shared. */
async function createThread(ctx: BridgeContext, kind: 'comment' | 'question'): Promise<void> {
  const collaboration = ctx.collaboration!;
  const body = await ctx.body();
  const info = ctx.chassis.getPageInfo();
  const activeTab = ctx.chassis.getTabsSummary().find((tab) => tab.isActive);
  const target = body?.target && typeof body.target === 'object'
    ? { ...body.target, url: body.target.url || info.url, tabId: body.target.tabId || activeTab?.id }
    : undefined;

  if (!target) {
    ctx.fail('A target is required.', 400, 'BAD_REQUEST');
    return;
  }
  const text = String(body?.text || body?.comment || body?.question || '').trim();
  if (!text) {
    ctx.fail('A comment or question is required.', 400, 'BAD_REQUEST');
    return;
  }
  const thread = collaboration.create({
    target,
    intent: body?.intent,
    tags: body?.tags,
    kind,
    text,
    choices: body?.choices,
  });
  ctx.json({ success: true, thread });
}

const ROUTES: Record<string, Handler> = {
  'GET /collaboration/threads': async (ctx) => {
    const collaboration = ctx.collaboration!;
    const id = ctx.url.searchParams.get('id');
    if (id) {
      const thread = collaboration.get(id);
      if (!thread) {
        ctx.fail(`Collaboration thread "${id}" not found.`, 404, 'COLLAB_NOT_FOUND');
        return;
      }
      ctx.json({ success: true, thread });
      return;
    }
    const status = ctx.url.searchParams.get('status');
    const threads = collaboration.list({
      url: ctx.url.searchParams.get('url') || undefined,
      status: status && ['open', 'answered', 'resolved', 'stale'].includes(status) ? status as any : undefined,
      tabId: ctx.url.searchParams.get('tabId') || undefined,
      limit: Number(ctx.url.searchParams.get('limit')) || undefined,
    });
    ctx.json({ success: true, threads });
  },

  'POST /collaboration/highlight': (ctx) => createThread(ctx, 'comment'),
  'POST /collaboration/ask': (ctx) => createThread(ctx, 'question'),

  'POST /collaboration/reply': async (ctx) => {
    const body = await ctx.body();
    const id = String(body?.id || '');
    const text = String(body?.text || '').trim();
    if (!id || !text) {
      ctx.fail('Thread id and text are required.', 400, 'BAD_REQUEST');
      return;
    }
    try {
      const thread = ctx.collaboration!.reply(id, {
        author: body?.author === 'human' ? 'human' : 'agent',
        kind: body?.kind === 'answer' ? 'answer' : 'comment',
        text,
        answer: body?.answer,
      });
      ctx.json({ success: true, thread });
    } catch (error: any) {
      ctx.fail(error?.message || String(error), 404, 'COLLAB_NOT_FOUND');
    }
  },

  'POST /collaboration/resolve': async (ctx) => {
    const body = await ctx.body();
    const id = String(body?.id || '');
    if (!id) {
      ctx.fail('Thread id is required.', 400, 'BAD_REQUEST');
      return;
    }
    try {
      ctx.json({ success: true, thread: ctx.collaboration!.resolve(id, body?.notes) });
    } catch (error: any) {
      ctx.fail(error?.message || String(error), 404, 'COLLAB_NOT_FOUND');
    }
  },
};

/** When to use: the request targets `/collaboration/*`; returns false for other paths. */
export async function handleCollaborationRoutes(ctx: BridgeContext): Promise<boolean> {
  if (!ctx.pathname.startsWith('/collaboration')) return false;
  if (!ctx.collaboration) {
    ctx.fail('Collaboration is not initialised.', 503, 'COLLAB_UNAVAILABLE');
    return true;
  }
  return await dispatchRouteTable(ctx, ROUTES, ctx.pathname, 'Collaboration endpoint not found.');
}
