/**
 * The bridge's decision and recipe routes.
 *
 * Why one module: the decision loop, its event log and the recipe store are one
 * feature — decide once, replay cheap next time. `/drive` and `/decide` both
 * hand the primitives to a model and both can escalate to a human, while
 * `/recipes` compiles a verified run back into replayable steps. Keeping the
 * escalation rules beside the recipe writer is what keeps a "decided" run and
 * its recorded recipe in sync.
 */
import { decisionStatus, runDecision } from '../decide/decision-client.js';
import { decideGuarded } from '../decide/decision-guard.js';
import { driveTask } from '../drive/driver.js';
import { compileDriveSteps } from '../recipes/compile.js';
import { deleteRecipe, loadRecipes, recipesFor, recordResult, retireRecipe, saveRecipe } from '../recipes/recipe-store.js';
import { replayRecipe, type RecipeRunner } from '../recipes/replay.js';
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type DecisionHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** The two collaborators the response helpers need; narrower than a full route context. */
type DecisionResponseContext = Pick<ChassisRouteContext, 'chassis' | 'sendJson'>;

/**
 * Compose the state the decision model sees. The caller's `state` is the base;
 * visible page text and a viewport screenshot are opt-in additions. Returns the
 * page-text flag so the caller can attach the page URL only when it was used.
 */
async function buildDecisionState(
  chassis: ChassisRouteContext['chassis'],
  body: any,
  useGuard: boolean,
): Promise<{ state: any; assets?: Record<string, unknown>; screenshotNote?: string; usedPageText: boolean }> {
  let state = body?.state;
  let usedPageText = false;
  if (body?.include_page_text === true || (body?.include_page_text !== false && useGuard)) {
    try {
      const page = await chassis.primitives.observe({ as: 'text', budget: 4000 });
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
    // Jev accepts images in the state, referenced by name from a top-level `assets` map.
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

  return { state, assets, screenshotNote, usedPageText };
}

/** Raise the HIL request for a guarded choice that cleared no threshold, then answer 409. */
function sendHumanDecisionRequired(ctx: DecisionResponseContext, body: any, result: any): void {
  const optionNames: string[] = [];
  for (const q of Object.values(body?.questions || {}) as any[]) {
    const criteria = q?.criteria;
    if (criteria && typeof criteria === 'object') optionNames.push(...Object.keys(criteria));
  }
  const options = [...new Set(optionNames)];
  const hilId = ctx.chassis.decision.requestForDecision(
    {
      question: typeof body?.state === 'string' ? body.state.split('\n')[0].slice(0, 140) : undefined,
      options,
      reasons: result.reasons,
    },
    ctx.chassis.getPageInfo().url,
  );
  ctx.sendJson(
    {
      success: false,
      error: 'human decision required — the guarded choice did not clear its threshold',
      code: 'HUMAN_DECISION_REQUIRED',
      human_required: true,
      hil_id: hilId,
      options,
      reasons: result.reasons,
      hint: 'Do NOT guess or act. A human has been asked (the HIL banner is up). Wait for them to resolve it, then re-observe the page and continue.',
      protocol: result.protocol,
      latencyMs: result.latencyMs,
    },
    409,
  );
}

/**
 * Map a failed decision to its HTTP status. A sensitive gate is a hand-off, not
 * just an error: raise the HIL request from Kuang so the human is actually asked
 * (throttled per URL, and skipped if one is already open).
 */
function sendDecisionFailure(ctx: DecisionResponseContext, result: any): void {
  const code = result.error?.code;
  if (code === 'HUMAN_REQUIRED') {
    const hint = result.error?.hint || '';
    const evidence = hint.replace(/^Matched:\s*/i, '').split(/\s*\|\s*/).filter(Boolean);
    // Do NOT await the intervention: its promise resolves when the *human* acts, which can
    // take minutes. The request itself is registered synchronously before the first await,
    // so the caller gets 409 immediately with the banner already up.
    void ctx.chassis.decision.requestForGate(
      { kind: result.gate, reason: result.error?.message || 'Human required', evidence },
      ctx.chassis.getPageInfo().url,
    );
  }
  // A guarded call whose every option was rejected is handled by the caller (accepted:false) —
  // this branch is for transport/backend failures only.
  const status = code === 'TIMEOUT' ? 504 : code === 'HUMAN_REQUIRED' ? 409 : code === 'UPSTREAM_ERROR' ? 502 : 400;
  ctx.sendJson(
    {
      success: false,
      // `error` stays a string: the MCP client turns it into "HTTP 400: <error>".
      error: result.error?.message || 'decision call failed',
      code,
      gate: result.gate,
      hint: result.error?.hint,
      fallback: result.fallback,
      reasons: result.reasons,
      upstreamStatus: result.error?.status,
      protocol: result.protocol,
      latencyMs: result.latencyMs,
    },
    status,
  );
}

const ROUTES: Record<string, DecisionHandler> = {
  // ---- navigation recipes (Phase 5) ----
  'GET /recipes': ({ url, sendJson }) => {
    const targetUrl = String(url.searchParams.get('url') || '');
    const store = loadRecipes();
    sendJson({ success: true, total: store.recipes.length, recipes: targetUrl ? recipesFor(targetUrl) : store.recipes });
  },

  'POST /recipes': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const action = String(body?.action || 'list');
    if (action === 'save') {
      const saved = saveRecipe({ url: body?.url, name: body?.name, path: body?.path, steps: body?.steps });
      sendJson({ success: saved.ok, ...saved }, saved.ok ? 200 : 400);
      return;
    }
    if (action === 'delete') {
      const removed = deleteRecipe(String(body?.id || ''));
      sendJson({ success: removed, removed });
      return;
    }
    if (action === 'replay') {
      const target = body?.id
        ? loadRecipes().recipes.find((r) => r.id === body.id)
        : recipesFor(String(body?.url || ''))[0];
      if (!target) {
        sendJson({ success: false, error: 'no recipe matched that id or url', code: 'NO_RECIPE' }, 404);
        return;
      }
      const result = await replayRecipe(chassis.primitives as unknown as RecipeRunner, target, {
        expectTimeoutMs: body?.expect_timeout_ms !== undefined ? Number(body.expect_timeout_ms) : undefined,
      });
      if (result.code === 'SIGNATURE_MISMATCH') {
        const retired = retireRecipe(target.id);
        sendJson({ success: false, code: 'SIGNATURE_MISMATCH', error: result.message, result, recipe: retired }, 409);
        return;
      }
      if (result.code === 'SIGNATURE_UNAVAILABLE') {
        sendJson({ success: false, code: 'SIGNATURE_UNAVAILABLE', error: result.message, result }, 409);
        return;
      }
      const updated = recordResult(target.id, result.status === 'ok');
      sendJson({ success: result.status === 'ok', result, recipe: updated });
      return;
    }
    const targetUrl = String(body?.url || '');
    sendJson({ success: true, total: loadRecipes().recipes.length, recipes: targetUrl ? recipesFor(targetUrl) : loadRecipes().recipes });
  },

  // ---- optional decision model (off unless configured) ----
  'POST /drive': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    if (!decisionStatus().configured) {
      sendJson({ success: false, error: 'No decision model is configured.', code: 'NOT_CONFIGURED' }, 400);
      return;
    }
    const result = await driveTask(chassis.primitives, {
      goal: String(body?.goal || ''),
      values: body?.values && typeof body.values === 'object' ? body.values : undefined,
      maxSteps: body?.max_steps ?? body?.maxSteps,
      threshold: body?.threshold,
      maxAttempts: body?.max_attempts ?? body?.maxAttempts,
      dryRun: body?.dry_run === true || body?.dryRun === true,
      includePageText: body?.include_page_text !== false,
    });
    if (result.status === 'human_required') {
      void chassis.decision.requestForGate({ kind: result.gate, reason: result.message, evidence: result.reasons }, result.url);
    }
    // Compile a verified run into a recipe on request: decide once, replay cheap next time.
    let recipe: any = null;
    if ((body?.save_recipe === true || body?.saveRecipe === true) && result.status === 'done') {
      const steps = compileDriveSteps(result.steps as any[], { values: body?.values || {} });
      if (steps.length) {
        const saved = saveRecipe({
          url: result.url || chassis.getPageInfo().url,
          name: body?.recipe_name || body?.recipeName || String(body?.goal || '').slice(0, 80),
          steps,
        });
        recipe = saved.ok ? saved.recipe : { error: saved.errors.join('; ') };
      }
    }
    // 200 with a status field: the transcript matters more than the HTTP code here.
    sendJson({ success: true, ...result, recipe });
  },

  'GET /decide': ({ sendJson }) => {
    sendJson({ success: true, ...decisionStatus() });
  },

  'POST /decide': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    // A guarded call (the decision loop) inspects the real page text as well as the caller's
    // state: a wall announces itself in copy ("Verify your birthday to continue") that the
    // component table alone does not carry. Raw `decide` stays a pure pipe.
    const useGuard = body?.guard !== undefined || body?.eliminate !== undefined;
    const { state, assets, screenshotNote, usedPageText } = await buildDecisionState(chassis, body, useGuard);

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
      sendHumanDecisionRequired({ chassis, sendJson }, body, result);
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
      sendJson({ success: true, ...result });
    } else {
      sendDecisionFailure({ chassis, sendJson }, result);
    }
  },
};

/**
 * When to use: the bridge request handler — dispatch the recipe store and the
 * decision model. Returns false when the method+path pair is not a decision
 * route.
 */
export async function handleDecisionRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
