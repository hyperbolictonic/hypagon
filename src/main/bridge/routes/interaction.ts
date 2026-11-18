/**
 * Interaction routes: navigation, pointer/keyboard actions, recipes, marks, scripts
 * and synthetic pointer motion.
 *
 * These are the mutating browser routes, so they sit behind the human-control gate
 * like every other write.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import { deleteRecipe, loadRecipes, recipesFor, recordResult, retireRecipe, saveRecipe } from '../../recipes/recipe-store.js';
import { replayRecipe, type RecipeRunner } from '../../recipes/replay.js';
import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/** The body of a navigate call accepts several aliases and a bare hostname. */
function navigateTarget(body: any): string {
  let target = body.url || body.destination || body.target || body.link || '';
  if (target && !/^https?:\/\//i.test(target) && !/^about:/i.test(target) && !/^mark-eleven:/i.test(target)) {
    target = 'https://' + target;
  }
  return target;
}

const listRecipes: Handler = async (ctx) => {
  const url = String(ctx.url.searchParams.get('url') || '');
  const store = loadRecipes();
  ctx.json({ success: true, total: store.recipes.length, recipes: url ? recipesFor(url) : store.recipes });
};

/** Resolve a mark badge id from any accepted spelling, or answer 400. */
function requireMarkId(ctx: BridgeContext, body: any): number | null {
  const rawId = body.markId ?? body.mark_id ?? body.mark ?? body.id ?? body.badge ?? body.index ?? body.num ?? body.number;
  if (rawId === undefined || isNaN(Number(rawId))) {
    ctx.fail('Must provide valid numeric markId (or mark_id)', 400);
    return null;
  }
  return Number(rawId);
}

const ROUTES: Record<string, Handler> = {
  'GET /recipes': listRecipes,

  'POST /recipes': async (ctx) => {
    const body = await ctx.body();
    const action = String(body?.action || 'list');
    if (action === 'save') {
      const saved = saveRecipe({ url: body?.url, name: body?.name, path: body?.path, steps: body?.steps });
      ctx.json({ success: saved.ok, ...saved }, saved.ok ? 200 : 400);
      return;
    }
    if (action === 'delete') {
      const removed = deleteRecipe(String(body?.id || ''));
      ctx.json({ success: removed, removed });
      return;
    }
    if (action === 'replay') {
      const target = body?.id
        ? loadRecipes().recipes.find((r) => r.id === body.id)
        : recipesFor(String(body?.url || ''))[0];
      if (!target) {
        ctx.fail('no recipe matched that id or url', 404, 'NO_RECIPE');
        return;
      }
      const result = await replayRecipe(ctx.chassis.getPrimitives() as unknown as RecipeRunner, target, {
        expectTimeoutMs: body?.expect_timeout_ms !== undefined ? Number(body.expect_timeout_ms) : undefined,
      });
      if (result.code === 'SIGNATURE_MISMATCH') {
        const retired = retireRecipe(target.id);
        ctx.json({ success: false, code: 'SIGNATURE_MISMATCH', error: result.message, result, recipe: retired }, 409);
        return;
      }
      if (result.code === 'SIGNATURE_UNAVAILABLE') {
        ctx.json({ success: false, code: 'SIGNATURE_UNAVAILABLE', error: result.message, result }, 409);
        return;
      }
      const updated = recordResult(target.id, result.status === 'ok');
      ctx.json({ success: result.status === 'ok', result, recipe: updated });
      return;
    }
    const url = String(body?.url || '');
    const store = loadRecipes();
    ctx.json({ success: true, total: store.recipes.length, recipes: url ? recipesFor(url) : store.recipes });
  },

  'POST /navigate': async (ctx) => {
    const body = await ctx.body();
    const autoDismiss = body.autoDismissConsent !== undefined ? Boolean(body.autoDismissConsent) : true;
    const result = await ctx.chassis.navigateTo(navigateTarget(body), autoDismiss);
    // Live nudge at the moment reading starts: the index is cheap, the dump is not.
    const guided = ctx.chassis.isJevEnforced()
      ? `${result} | JEV ENFORCED: unscoped page reads are refused. Call jev_index, then read_section for only what you need.`
      : ctx.chassis.isJevEnabled()
        ? `${result} | JEV ACTIVE: call jev_index before reading this page, then read_section for only what you need.`
        : result;
    ctx.json({ success: true, result: guided });
  },

  'POST /shield/dismiss': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.chassis.dismissConsent({
      policy: body?.policy,
      forceRemove: body?.force_remove === true || body?.forceRemove === true,
    });
    ctx.json({ success: true, result });
  },

  'POST /click': async (ctx) => {
    const body = await ctx.body();
    const selector = body.selector || body.element || body.target || body.css;
    const x = body.x !== undefined ? Number(body.x) : undefined;
    const y = body.y !== undefined ? Number(body.y) : undefined;
    const coords = x !== undefined && !isNaN(x) && y !== undefined && !isNaN(y) ? { x, y } : undefined;
    if (!selector && !coords) {
      ctx.fail('Must provide either "selector" or coordinates (x, y)', 400);
      return;
    }
    ctx.json({ success: true, result: await ctx.chassis.clickElement(selector, coords) });
  },

  'POST /type': async (ctx) => {
    const body = await ctx.body();
    const selector = body.selector || body.element || body.target;
    const text = body.text ?? body.value ?? body.content ?? body.input ?? '';
    ctx.json({ success: true, result: await ctx.chassis.typeText(String(text), selector) });
  },

  'POST /form/fill': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, result: await ctx.chassis.fillForm(body.fields || {}, body.submitSelector) });
  },

  'POST /press-key': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, result: await ctx.chassis.pressKey(body.key) });
  },

  'POST /scroll': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, result: await ctx.chassis.scrollPage(body.direction || 'down', body.amount || 400) });
  },

  'GET /marks/screenshot': async (ctx) => {
    const flag = (name: string) => ['1', 'true'].includes((ctx.url.searchParams.get(name) || '').toLowerCase());
    const result = await ctx.chassis.takeAnnotatedScreenshot({
      economy: flag('economy'),
      textOnly: flag('text_only'),
      includeOffscreen: flag('include_offscreen'),
    });
    ctx.json({ success: true, ...result });
  },

  'POST /marks/click': async (ctx) => {
    const body = await ctx.body();
    const markId = requireMarkId(ctx, body);
    if (markId === null) return;
    ctx.json({ success: true, result: await ctx.chassis.clickMark(markId) });
  },

  'POST /marks/type': async (ctx) => {
    const body = await ctx.body();
    const markId = requireMarkId(ctx, body);
    if (markId === null) return;
    const text = body.text ?? body.value ?? body.content ?? body.input ?? '';
    const result = await ctx.chassis.typeMark(markId, String(text), {
      clearFirst: body?.clear_first === true || body?.clearFirst === true,
    });
    ctx.json({ success: true, result });
  },

  'GET /marks/list': async (ctx) => {
    ctx.json({ success: true, marks: ctx.chassis.getActiveMarks() });
  },

  'POST /scripts/save': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, script: await ctx.chassis.saveScript(body) });
  },

  'GET /scripts/recall': async (ctx) => {
    const scripts = await ctx.chassis.recallScripts(undefined, {});
    ctx.json({ success: true, scripts });
  },

  'POST /scripts/recall': async (ctx) => {
    const body = await ctx.body();
    const scripts = await ctx.chassis.recallScripts(body.query, {
      domain: body.domain,
      tag: body.tag,
      limit: body.limit,
    });
    ctx.json({ success: true, scripts });
  },

  'POST /scripts/run': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, execution: await ctx.chassis.runScript(body.name, body.args) });
  },

  'GET /scripts/list': async (ctx) => {
    const limitParam = ctx.url.searchParams.get('limit');
    const scripts = await ctx.chassis.recallScripts(ctx.url.searchParams.get('q') || undefined, {
      tag: ctx.url.searchParams.get('tag') || undefined,
      limit: limitParam ? parseInt(limitParam, 10) : 100,
    });
    ctx.json({ success: true, scripts });
  },

  'POST /scripts/delete': async (ctx) => {
    const body = await ctx.body();
    ctx.json({ success: true, deleted: await ctx.chassis.deleteScript(body.name) });
  },

  'POST /history': async (ctx) => {
    const body = await ctx.body();
    let result = '';
    if (body.action === 'back') result = await ctx.chassis.goBack();
    else if (body.action === 'forward') result = await ctx.chassis.goForward();
    else if (body.action === 'reload') result = await ctx.chassis.reload();
    ctx.json({ success: true, result });
  },

  'POST /chaos/trajectory': async (ctx) => {
    const body = await ctx.body();
    const steps = ctx.chassis.testChaosTrajectory(body.target || { x: 500, y: 500 }, body.options);
    const correctiveSteps = steps.filter((s) => s.isCorrective).length;
    ctx.json({
      success: true,
      steps,
      metrics: {
        stepCount: steps.length,
        totalDurationMs: steps.reduce((sum, s) => sum + s.delayMs, 0),
        peakVelocity: Math.max(...steps.map((s) => s.velocity)),
        hasOvershoot: correctiveSteps > 0,
        correctiveSteps,
      },
    });
  },

  'POST /mouse/move': async (ctx) => {
    const body = await ctx.body();
    const target = body.target || { x: 500, y: 500 };
    await ctx.chassis.moveMouse(target, body.options);
    ctx.json({ success: true, target });
  },
};

/** When to use: the request is a navigation, action, recipe, mark or script call. */
export async function handleInteractionRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
