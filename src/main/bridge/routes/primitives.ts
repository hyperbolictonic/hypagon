/**
 * Primitives routes: the observe / find / act / wait / extract / collect layer.
 *
 * These are the agent's main sensing and acting surface. They intentionally accept
 * both snake_case and camelCase spellings because every tool description advertises
 * one of them, and the MCP server forwards caller input verbatim.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/** Conditions arrive as `conditions[]` or a single `condition`. */
function readConditions(body: any): any[] {
  return Array.isArray(body?.conditions) ? body.conditions : body?.condition ? [body.condition] : [];
}

/** Optional number: keep `undefined` distinct from `0`. */
function num(raw: unknown): number | undefined {
  return raw !== undefined && raw !== null ? Number(raw) : undefined;
}

const pageState: Handler = async (ctx) => {
  ctx.json({ success: true, state: await ctx.chassis.getPrimitives().pageState() });
};

const ROUTES: Record<string, Handler> = {
  'GET /page-version': async (ctx) => {
    ctx.json({ success: true, revision: ctx.chassis.getRevision(), capabilities: ctx.chassis.getCapabilities() });
  },

  'GET /page-state': pageState,
  'POST /page-state': pageState,

  'POST /diff': async (ctx) => {
    const body = await ctx.body();
    const since = body?.since !== undefined && body.since !== null && body.since !== '' ? Number(body.since) : undefined;
    const diff = await ctx.chassis.getPrimitives().diff(isNaN(Number(since)) ? undefined : since);
    ctx.json({ success: true, ...diff });
  },

  'POST /wait-for': async (ctx) => {
    const body = await ctx.body();
    const conditions = readConditions(body);
    if (!conditions.length) {
      ctx.fail('Provide { conditions: [{type:"selector", selector:"..."}] }', 400, 'BAD_REQUEST');
      return;
    }
    const result = await ctx.chassis.getPrimitives().waitFor(conditions, {
      timeoutMs: body.timeout_ms ?? body.timeoutMs,
      pollMs: body.poll_ms ?? body.pollMs,
      require: body.require === 'all' ? 'all' : 'any',
    });
    ctx.json({ success: true, ...result });
  },

  'POST /expect': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.getPrimitives().expect(readConditions(body));
    ctx.json({ success: true, ...result });
  },

  'POST /observe': async (ctx) => {
    const body = await ctx.body();
    const obs = await ctx.chassis.getPrimitives().observe({
      as: body?.as || body?.format || 'markdown',
      region: body?.region,
      budget: num(body?.budget),
      cursor: body?.cursor,
      includeOffscreen: body?.include_offscreen === true || body?.includeOffscreen === true,
      includeFrames: body?.include_frames === true || body?.includeFrames === true,
      limit: num(body?.limit),
      full: body?.full === true,
    });
    ctx.json({ success: true, ...obs });
  },

  'POST /extract': async (ctx) => {
    const body = await ctx.body();
    const data = await ctx.chassis.getPrimitives().extract({
      kind: body?.kind || 'list',
      ref: num(body?.ref),
      selector: body?.selector,
      type: body?.type,
      limit: num(body?.limit),
      includeFrames: body?.include_frames === true,
      maxFrames: num(body?.max_frames),
      timeoutMs: num(body?.timeout_ms),
    });
    ctx.json({ success: true, ...data });
  },

  'POST /collect': async (ctx) => {
    const body = await ctx.body();
    const data = await ctx.chassis.getPrimitives().collectAll({
      ref: num(body?.ref),
      selector: body?.selector,
      scroll: body?.scroll === 'window' ? 'window' : 'container',
      step: num(body?.step),
      delayMs: body?.delay_ms ?? body?.delayMs,
      maxScrolls: body?.max_scrolls ?? body?.maxScrolls,
      max: num(body?.max),
    });
    ctx.json({ success: true, ...data });
  },

  'POST /focus_walk': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.focusWalk({
      selector: body?.selector,
      x: num(body?.x),
      y: num(body?.y),
      direction: body?.direction === 'backward' ? 'backward' : 'forward',
      maxSteps: num(body?.max_steps),
      restore: body?.restore !== false,
    });
    ctx.json({ success: true, ...result });
  },

  'POST /find': async (ctx) => {
    const body = await ctx.body();
    const data = await ctx.chassis.getPrimitives().find({
      role: body?.role,
      name: body?.name,
      contains: body?.contains ?? body?.text,
      regex: body?.regex,
      flags: body?.flags,
      tag: body?.tag,
      selector: body?.selector,
      limit: num(body?.limit),
      includeOffscreen: body?.include_offscreen === undefined ? true : body.include_offscreen === true,
      sealed: body?.sealed === true,
      includeFrames: body?.include_frames === true,
      refresh: body?.refresh === true,
    });
    ctx.json({ success: true, ...data });
  },

  'POST /act': async (ctx) => {
    const body = await ctx.body();
    const rawId = body?.mark_id ?? body?.markId ?? body?.mark ?? body?.id ?? body?.badge;
    const selector = body?.selector || body?.element || body?.target || body?.css;
    const targetText =
      body?.target_text !== undefined ? String(body.target_text) : body?.targetText !== undefined ? String(body.targetText) : undefined;
    const sealedToken =
      body?.sealed_token !== undefined ? String(body.sealed_token) : body?.sealedToken !== undefined ? String(body.sealedToken) : undefined;
    const result = await ctx.chassis.getPrimitives().act({
      markId: rawId !== undefined && rawId !== null ? Number(rawId) : undefined,
      selector,
      targetText,
      targetExact: body?.target_exact === true || body?.targetExact === true,
      sealedToken,
      x: num(body?.x),
      y: num(body?.y),
      action: body?.action || 'click',
      text: body?.text !== undefined ? String(body.text) : undefined,
      secret: body?.secret === true,
      clearFirst: body?.clear_first === true || body?.clearFirst === true,
      await: Array.isArray(body?.await) ? body.await : Array.isArray(body?.await_conditions) ? body.await_conditions : undefined,
      timeoutMs: body?.timeout_ms ?? body?.timeoutMs,
      dryRun: body?.dry_run === true || body?.dryRun === true,
      includeOffscreen: body?.include_offscreen === undefined ? true : body.include_offscreen === true,
    });
    ctx.json({ success: true, ...result });
  },
};

/** When to use: the request is a primitives call (observe, find, act, wait, extract, collect). */
export async function handlePrimitiveRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
