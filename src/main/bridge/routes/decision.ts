/**
 * Decision routes: the optional decision model, its transcript and the drive loop.
 *
 * Everything here is inert until a decision model is configured. A sensitive gate is
 * a hand-off, not an error: the route raises a HIL request and answers 409 so the
 * caller stops instead of guessing.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import { decideGuarded } from '../../decide/decision-guard.js';
import { decisionStatus, runDecision } from '../../decide/decision-client.js';
import { driveTask } from '../../drive/driver.js';
import { compileDriveSteps } from '../../recipes/compile.js';
import { saveRecipe } from '../../recipes/recipe-store.js';
import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/**
 * POST /decide.
 *
 * A guarded call (the decision loop) inspects the real page text as well as the
 * caller's state: a wall announces itself in copy ("Verify your birthday to
 * continue") that the component table alone does not carry. Raw `decide` stays a
 * pure pipe.
 */
async function decide(ctx: BridgeContext): Promise<void> {
  const chassis = ctx.chassis;
  const body = await ctx.body();
  const useGuard = body?.guard !== undefined || body?.eliminate !== undefined;
  let state = body?.state;
  let usedPageText = false;
  if (body?.include_page_text === true || (body?.include_page_text !== false && useGuard)) {
    try {
      const page = await chassis.getPrimitives().observe({ as: 'text', budget: 4000 });
      const pageText = typeof page?.text === 'string' ? page.text.slice(0, 4000) : '';
      if (pageText.trim()) {
        state = `${typeof state === 'string' ? state : JSON.stringify(state ?? '')}\n\nVisible page text:\n${pageText}`;
        usedPageText = true;
      }
    } catch {
      // No page context available (e.g. called before a tab exists) — carry on with the state.
    }
  }
  let assets: Record<string, unknown> | undefined;
  let screenshotNote: string | undefined;
  if (body?.include_screenshot === true) {
    // Only the hosted backend is multimodal; say so rather than silently dropping the image.
    const endpoint = decisionStatus().endpoint || '';
    if (/opencode\.ai/i.test(endpoint)) {
      // The OpenCode gateway does not forward TypeSafe's Danger-Zone header (verified directly),
      // so an image can only end in a 400. Refuse up front and say why.
      screenshotNote =
        'disabled: the OpenCode gateway does not forward TypeSafe headers — images only work against api.typesafe.ai';
    } else if (decisionStatus().protocol === 'typesafe') {
      const shot = await chassis.captureScreenshotJpeg().catch(() => null);
      if (shot) {
        const ref = `kuang-shot-${Date.now().toString(36)}`;
        const text = typeof state === 'string' ? state : JSON.stringify(state ?? '');
        state = {
          text: `${text}\n\nA screenshot of the visible viewport (${shot.width}x${shot.height}) is attached as \`${ref}\`.`,
          screenshot: ref,
        };
        assets = { [ref]: { type: 'image', format: 'jpg', data_base64: shot.base64 } };
        screenshotNote = `${shot.width}x${shot.height} jpeg attached`;
      } else {
        screenshotNote = 'capture failed — decided without an image';
      }
    } else {
      screenshotNote = 'ignored: the local ONNX model is text-only';
    }
  }

  const result = useGuard
    ? await decideGuarded({
        state,
        pageUrl: usedPageText ? chassis.getPageInfo().url : undefined,
        questions: body?.questions || {},
        model: body?.model,
        assets,
        guard: body?.guard || {},
        maxAttempts: body?.eliminate?.max_attempts ?? body?.eliminate?.maxAttempts ?? (body?.eliminate ? 3 : 1),
      })
    : await runDecision({
        state,
        pageUrl: usedPageText ? chassis.getPageInfo().url : undefined,
        questions: body?.questions || {},
        model: body?.model,
        assets,
      });
  if (screenshotNote || (result as any).imageNote) {
    (result as any).screenshot = (result as any).imageNote || screenshotNote;
  }
  // A guarded call that did not accept any answer (`accepted:false` — confidence gate or every
  // option eliminated) is exactly the case a person should answer. Note it arrives with
  // ok:true, so this must be checked BEFORE the success branch.
  if ((result as any).accepted === false) {
    const optionNames: string[] = [];
    for (const q of Object.values(body?.questions || {}) as any[]) {
      const criteria = q?.criteria;
      if (criteria && typeof criteria === 'object') optionNames.push(...Object.keys(criteria));
    }
    const options = [...new Set(optionNames)];
    const hilId = chassis.requestHumanForDecision(
      {
        question: typeof body?.state === 'string' ? body.state.split('\n')[0].slice(0, 140) : undefined,
        options,
        reasons: (result as any).reasons,
      },
      chassis.getPageInfo().url,
    );
    ctx.json(
      {
        success: false,
        error: 'human decision required — the guarded choice did not clear its threshold',
        code: 'HUMAN_DECISION_REQUIRED',
        human_required: true,
        hil_id: hilId,
        options,
        reasons: (result as any).reasons,
        hint: 'Do NOT guess or act. A human has been asked (the HIL banner is up). Wait for them to resolve it, then re-observe the page and continue.',
        protocol: result.protocol,
        latencyMs: result.latencyMs,
      },
      409,
    );
    return;
  }
  if (result.ok) {
    // "Blocked" without a deterministic match is not a compliance boundary we can prove.
    // The agent decides: it may know the site, or it may call request_human_intervention.
    const operation = (result as any).answers?.operation?.choice;
    if (operation === 'blocked' && !(result as any).gate) {
      (result as any).hint =
        'No deterministic gate matched (no age-verification or CAPTCHA copy). The agent decides: if this is a compliance boundary — age, CAPTCHA, payment, identity — call request_human_intervention; otherwise choose the next step yourself.';
    }
    ctx.json({ success: true, ...result });
    return;
  }
  const code = result.error?.code;
  // A sensitive gate is a hand-off, not just an error: raise the HIL request from Kuang so
  // the human is actually asked (throttled per URL, and skipped if one is already open).
  if (code === 'HUMAN_REQUIRED') {
    const hint = result.error?.hint || '';
    const evidence = hint.replace(/^Matched:\s*/i, '').split(/\s*\|\s*/).filter(Boolean);
    // Do NOT await the intervention: its promise resolves when the *human* acts, which can
    // take minutes. The request itself is registered synchronously before the first await,
    // so the caller gets 409 immediately with the banner already up.
    void chassis.requestHumanForGate(
      { kind: (result as any).gate, reason: result.error?.message || 'Human required', evidence },
      chassis.getPageInfo().url,
    );
  }
  // A guarded call whose every option was rejected is handled above (accepted:false) —
  // this branch is for transport/backend failures only.
  const status = code === 'TIMEOUT' ? 504 : code === 'HUMAN_REQUIRED' ? 409 : code === 'UPSTREAM_ERROR' ? 502 : 400;
  ctx.json(
    {
      success: false,
      // `error` stays a string: the MCP client turns it into "HTTP 400: <error>".
      error: result.error?.message || 'decision call failed',
      code,
      gate: (result as any).gate,
      hint: result.error?.hint,
      fallback: (result as any).fallback,
      reasons: (result as any).reasons,
      upstreamStatus: result.error?.status,
      protocol: result.protocol,
      latencyMs: result.latencyMs,
    },
    status,
  );
}

const ROUTES: Record<string, Handler> = {
  'POST /drive': async (ctx) => {
    const body = await ctx.body();
    if (!decisionStatus().configured) {
      ctx.fail('No decision model is configured.', 400, 'NOT_CONFIGURED');
      return;
    }
    const result = await driveTask(ctx.chassis.getPrimitives(), {
      goal: String(body?.goal || ''),
      values: body?.values && typeof body.values === 'object' ? body.values : undefined,
      maxSteps: body?.max_steps ?? body?.maxSteps,
      threshold: body?.threshold,
      maxAttempts: body?.max_attempts ?? body?.maxAttempts,
      dryRun: body?.dry_run === true || body?.dryRun === true,
      includePageText: body?.include_page_text !== false,
    });
    if (result.status === 'human_required') {
      void ctx.chassis.requestHumanForGate({ kind: result.gate, reason: result.message, evidence: result.reasons }, result.url);
    }
    // Compile a verified run into a recipe on request: decide once, replay cheap next time.
    let recipe: any = null;
    if ((body?.save_recipe === true || body?.saveRecipe === true) && result.status === 'done') {
      const steps = compileDriveSteps(result.steps as any[], { values: body?.values || {} });
      if (steps.length) {
        const saved = saveRecipe({
          url: result.url || ctx.chassis.getPageInfo().url,
          name: body?.recipe_name || body?.recipeName || String(body?.goal || '').slice(0, 80),
          steps,
        });
        recipe = saved.ok ? saved.recipe : { error: saved.errors.join('; ') };
      }
    }
    // 200 with a status field: the transcript matters more than the HTTP code here.
    ctx.json({ success: true, ...result, recipe });
  },

  'GET /decisions': async (ctx) => {
    const decisions = ctx.chassis.getDecisionEvents();
    ctx.json({ success: true, count: decisions.length, decisions });
  },

  'GET /decide': async (ctx) => {
    ctx.json({ success: true, ...decisionStatus() });
  },

  'POST /decide': decide,
};

/** When to use: the request is a decision-model call, its transcript or the drive loop. */
export async function handleDecisionRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
