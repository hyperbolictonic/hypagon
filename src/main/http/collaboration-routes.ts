/**
 * The bridge's `/collaboration/*` routes.
 *
 * Why a module: the family shares one service guard, one "endpoint not found"
 * fallback and one set of page-context lookups (`getPageInfo`, the active tab)
 * that only the create path needs. Keeping them in the 1900-line handler meant
 * the guard and the 404 were re-derived by every reader.
 */
import type { BrowserChassis } from '../browser-chassis.js';
import type { CollaborationService } from '../collaboration/service.js';

/** When to use: building the collaboration dispatcher — request facts, page context and bridge helpers. */
export interface CollaborationRouteContext {
  collaboration?: CollaborationService;
  chassis: BrowserChassis;
  method: string | undefined;
  pathname: string;
  url: URL;
  readBody: () => Promise<any>;
  sendJson: (data: any, status?: number) => void;
}

type CollaborationHandler = (
  service: CollaborationService,
  ctx: CollaborationRouteContext,
) => Promise<void> | void;

const ROUTES: Record<string, CollaborationHandler> = {
  'GET /collaboration/threads': (service, { url, sendJson }) => {
    const id = url.searchParams.get('id');
    if (id) {
      const thread = service.get(id);
      if (!thread) {
        sendJson({ success: false, error: `Collaboration thread "${id}" not found.`, code: 'COLLAB_NOT_FOUND' }, 404);
        return;
      }
      sendJson({ success: true, thread });
      return;
    }
    const status = url.searchParams.get('status');
    const threads = service.list({
      url: url.searchParams.get('url') || undefined,
      status: status && ['open', 'answered', 'resolved', 'stale'].includes(status) ? status as any : undefined,
      tabId: url.searchParams.get('tabId') || undefined,
      limit: Number(url.searchParams.get('limit')) || undefined,
    });
    sendJson({ success: true, threads });
  },

  'POST /collaboration/highlight': async (service, ctx) => createThread(service, ctx, 'comment'),
  'POST /collaboration/ask': async (service, ctx) => createThread(service, ctx, 'question'),

  'POST /collaboration/reply': async (service, { readBody, sendJson }) => {
    const body = await readBody();
    const id = String(body?.id || '');
    const text = String(body?.text || '').trim();
    if (!id || !text) {
      sendJson({ success: false, error: 'Thread id and text are required.', code: 'BAD_REQUEST' }, 400);
      return;
    }
    try {
      const thread = service.reply(id, {
        author: body?.author === 'human' ? 'human' : 'agent',
        kind: body?.kind === 'answer' ? 'answer' : 'comment',
        text,
        answer: body?.answer,
      });
      sendJson({ success: true, thread });
    } catch (error: any) {
      sendJson({ success: false, error: error?.message || String(error), code: 'COLLAB_NOT_FOUND' }, 404);
    }
  },

  'POST /collaboration/resolve': async (service, { readBody, sendJson }) => {
    const body = await readBody();
    const id = String(body?.id || '');
    if (!id) {
      sendJson({ success: false, error: 'Thread id is required.', code: 'BAD_REQUEST' }, 400);
      return;
    }
    try {
      sendJson({ success: true, thread: service.resolve(id, body?.notes) });
    } catch (error: any) {
      sendJson({ success: false, error: error?.message || String(error), code: 'COLLAB_NOT_FOUND' }, 404);
    }
  },
};

/** Highlight and ask differ only in the thread kind; the target/text validation is shared. */
async function createThread(
  service: CollaborationService,
  { chassis, readBody, sendJson }: CollaborationRouteContext,
  kind: 'comment' | 'question',
): Promise<void> {
  const body = await readBody();
  const info = chassis.getPageInfo();
  const activeTab = chassis.getTabsSummary().find((tab) => tab.isActive);
  const target = body?.target && typeof body.target === 'object'
    ? { ...body.target, url: body.target.url || info.url, tabId: body.target.tabId || activeTab?.id }
    : undefined;
  if (!target) {
    sendJson({ success: false, error: 'A target is required.', code: 'BAD_REQUEST' }, 400);
    return;
  }
  const text = String(body?.text || body?.comment || body?.question || '').trim();
  if (!text) {
    sendJson({ success: false, error: 'A comment or question is required.', code: 'BAD_REQUEST' }, 400);
    return;
  }
  const thread = service.create({
    target,
    intent: body?.intent,
    tags: body?.tags,
    kind,
    text,
    choices: body?.choices,
  });
  sendJson({ success: true, thread });
}

/**
 * When to use: the bridge request handler — dispatch `/collaboration/*` before
 * the generic routes. Returns false when the path is not a collaboration route.
 */
export async function handleCollaborationRoutes(ctx: CollaborationRouteContext): Promise<boolean> {
  if (!ctx.pathname.startsWith('/collaboration')) return false;
  if (!ctx.collaboration) {
    ctx.sendJson({ success: false, error: 'Collaboration is not initialised.', code: 'COLLAB_UNAVAILABLE' }, 503);
    return true;
  }
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) {
    ctx.sendJson({ success: false, error: 'Collaboration endpoint not found.', code: 'NOT_FOUND' }, 404);
    return true;
  }
  await handler(ctx.collaboration, ctx);
  return true;
}
