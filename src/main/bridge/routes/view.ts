/**
 * View routes: page zoom, responsive device emulation and tabs.
 *
 * The deck and the agent tools share these handlers; nothing here mutates settings.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/** Accept `3`, `"3"` or `"tab_3"` from either tool or deck callers. */
function normalizeTabId(raw: unknown): string | undefined {
  if (typeof raw === 'number') return `tab_${raw}`;
  if (raw && !String(raw).startsWith('tab_') && !isNaN(Number(raw))) return `tab_${raw}`;
  return raw === undefined || raw === null ? undefined : String(raw);
}

/** `/tabs` and `/tabs/list` are the same read; keep one handler. */
const listTabs: Handler = async (ctx) => {
  ctx.json({ success: true, tabs: ctx.chassis.getTabsSummary() });
};

/** Read the tab id from a request body in any of the accepted spellings. */
async function requestTabId(ctx: BridgeContext): Promise<string | undefined> {
  const body = await ctx.body();
  return normalizeTabId(body.tabId ?? body.tab_id ?? body.tab ?? body.id);
}

const ROUTES: Record<string, Handler> = {
  'GET /zoom': async (ctx) => {
    ctx.json({ success: true, zoom: ctx.chassis.getZoomState() });
  },

  'POST /zoom': async (ctx) => {
    const body = await ctx.body();
    const action = body?.action === 'in' || body?.action === 'out' || body?.action === 'reset' || body?.action === 'status'
      ? body.action
      : 'status';
    const factor = body?.factor !== undefined ? Number(body.factor) : undefined;
    if (body?.action === 'set' && factor === undefined) {
      ctx.fail('action "set" requires a numeric factor.', 400, 'BAD_REQUEST');
      return;
    }
    if (factor !== undefined && (!Number.isFinite(factor) || factor < 0.25 || factor > 5)) {
      ctx.fail('factor must be between 0.25 and 5.', 400, 'BAD_REQUEST');
      return;
    }
    ctx.json({ success: true, zoom: ctx.chassis.setZoom({ action, factor }) });
  },

  'GET /viewport': async (ctx) => {
    ctx.json({ success: true, viewport: ctx.chassis.getViewportState() });
  },

  'POST /viewport': async (ctx) => {
    const body = await ctx.body();
    const requested =
      body?.action === 'reset' || body?.action === 'rotate' || body?.action === 'set' || body?.action === 'status'
        ? body.action
        : body?.preset !== undefined || body?.width !== undefined
          ? 'set'
          : 'status';
    try {
      const viewport = await ctx.chassis.setViewport({
        action: requested,
        preset: typeof body?.preset === 'string' ? body.preset : undefined,
        width: body?.width !== undefined ? Number(body.width) : undefined,
        height: body?.height !== undefined ? Number(body.height) : undefined,
        deviceScaleFactor:
          body?.device_scale_factor !== undefined
            ? Number(body.device_scale_factor)
            : body?.deviceScaleFactor !== undefined
              ? Number(body.deviceScaleFactor)
              : undefined,
        mobile: typeof body?.mobile === 'boolean' ? body.mobile : undefined,
        touch: typeof body?.touch === 'boolean' ? body.touch : undefined,
      });
      ctx.json({ success: true, viewport });
    } catch (error: any) {
      ctx.fail(error?.message || String(error), 400, 'BAD_REQUEST');
    }
  },

  'GET /tabs': listTabs,

  'GET /tabs/list': listTabs,

  'POST /tabs/new': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, tab: ctx.chassis.createTab(body.url) });
  },

  'POST /tabs/switch': async (ctx) => {
    const rawId = await requestTabId(ctx);
    ctx.chassis.switchTab(rawId as string);
    ctx.json({ success: true, message: `Switched to tab ${rawId}` });
  },

  'POST /tabs/close': async (ctx) => {
    const rawId = await requestTabId(ctx);
    ctx.chassis.closeTab(rawId as string);
    ctx.json({ success: true, message: `Closed tab ${rawId || 'active'}` });
  },
};

/** When to use: the request targets tabs, zoom or viewport; false leaves it to other families. */
export async function handleViewRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
