/**
 * The bridge's primitive routes: observe/act/wait building blocks plus the
 * chaos-kinematics and mouse-movement probes.
 *
 * Why one module: these are the low-level verbs the higher-level research and
 * decision surfaces are built from — page version/state, diff, wait/expect,
 * focus walk, find, act, and the trajectory simulator. They share the primitives
 * object as their collaborator, and several aliases (`GET` and `POST` for
 * `/page-state`) are declared side by side so the two spellings cannot drift.
 */
import { BRIDGE_CAPABILITIES } from '../capabilities.js';
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type PrimitiveHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** `GET` and `POST /page-state` are the same read; declared once so they cannot drift. */
const pageState = async ({ chassis, sendOk }: ChassisRouteContext) => {
  sendOk({ state: await chassis.getPrimitives().pageState() });
};

/** Both wait-for and expect accept one condition or a list; normalize the alias once. */
const conditionsOf = (body: any): any[] =>
  Array.isArray(body?.conditions) ? body.conditions : body?.condition ? [body.condition] : [];

const ROUTES: Record<string, PrimitiveHandler> = {
  // ---- Chaos Kinematics & Mouse Movement Endpoints ----
  'POST /chaos/trajectory': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const target = body.target || { x: 500, y: 500 };
    const steps = chassis.input.testChaosTrajectory(target, body.options);
    const totalDurationMs = steps.reduce((sum, s) => sum + s.delayMs, 0);
    const peakVelocity = Math.max(...steps.map((s) => s.velocity));
    const correctiveSteps = steps.filter((s) => s.isCorrective).length;
    sendJson({
      success: true,
      steps,
      metrics: {
        stepCount: steps.length,
        totalDurationMs,
        peakVelocity,
        hasOvershoot: correctiveSteps > 0,
        correctiveSteps,
      },
    });
  },

  'POST /mouse/move': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const target = body.target || { x: 500, y: 500 };
    await chassis.input.moveMouse(target, body.options);
    sendJson({ success: true, target });
  },

  // ---- Primitives layer (observe / act / wait / extract / collect / find) ----
  'GET /page-version': ({ chassis, sendJson }) => {
    sendJson({ success: true, revision: chassis.getRevision(), capabilities: BRIDGE_CAPABILITIES });
  },

  'GET /page-state': pageState,

  'POST /page-state': pageState,

  'POST /diff': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const since = body?.since !== undefined && body.since !== null && body.since !== '' ? Number(body.since) : undefined;
    const diff = await chassis.getPrimitives().diff(isNaN(Number(since)) ? undefined : since);
    sendOk(diff);
  },

  'POST /wait-for': async ({ chassis, readBody, sendJson, sendOk }) => {
    const body = await readBody();
    const conditions = conditionsOf(body);
    if (!conditions.length) {
      sendJson({ success: false, error: 'Provide { conditions: [{type:"selector", selector:"..."}] }', code: 'BAD_REQUEST' }, 400);
      return;
    }
    const result = await chassis.getPrimitives().waitFor(conditions, {
      timeoutMs: body.timeout_ms ?? body.timeoutMs,
      pollMs: body.poll_ms ?? body.pollMs,
      require: body.require === 'all' ? 'all' : 'any',
    });
    sendOk(result);
  },

  'POST /expect': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk(await chassis.getPrimitives().expect(conditionsOf(body)));
  },

  'POST /focus_walk': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const result = await chassis.shadow.focusWalk({
      selector: body?.selector,
      x: body?.x !== undefined ? Number(body.x) : undefined,
      y: body?.y !== undefined ? Number(body.y) : undefined,
      direction: body?.direction === 'backward' ? 'backward' : 'forward',
      maxSteps: body?.max_steps !== undefined ? Number(body.max_steps) : undefined,
      restore: body?.restore !== false,
    });
    sendOk(result);
  },

  'POST /find': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const data = await chassis.getPrimitives().find({
      role: body?.role,
      name: body?.name,
      contains: body?.contains ?? body?.text,
      regex: body?.regex,
      flags: body?.flags,
      tag: body?.tag,
      selector: body?.selector,
      limit: body?.limit !== undefined ? Number(body.limit) : undefined,
      includeOffscreen: body?.include_offscreen === undefined ? true : body.include_offscreen === true,
      sealed: body?.sealed === true,
      includeFrames: body?.include_frames === true,
      refresh: body?.refresh === true,
    });
    sendOk(data);
  },

  'POST /act': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const rawId = body?.mark_id ?? body?.markId ?? body?.mark ?? body?.id ?? body?.badge;
    const selector = body?.selector || body?.element || body?.target || body?.css;
    const targetText =
      body?.target_text !== undefined
        ? String(body.target_text)
        : body?.targetText !== undefined
          ? String(body.targetText)
          : undefined;
    const x = body?.x !== undefined ? Number(body.x) : undefined;
    const y = body?.y !== undefined ? Number(body.y) : undefined;
    const result = await chassis.getPrimitives().act({
      markId: rawId !== undefined && rawId !== null ? Number(rawId) : undefined,
      selector,
      targetText,
      targetExact: body?.target_exact === true || body?.targetExact === true,
      sealedToken:
        body?.sealed_token !== undefined
          ? String(body.sealed_token)
          : body?.sealedToken !== undefined
            ? String(body.sealedToken)
            : undefined,
      x,
      y,
      action: body?.action || 'click',
      text: body?.text !== undefined ? String(body.text) : undefined,
      secret: body?.secret === true,
      clearFirst: body?.clear_first === true || body?.clearFirst === true,
      await: Array.isArray(body?.await) ? body.await : Array.isArray(body?.await_conditions) ? body.await_conditions : undefined,
      timeoutMs: body?.timeout_ms ?? body?.timeoutMs,
      dryRun: body?.dry_run === true || body?.dryRun === true,
      includeOffscreen: body?.include_offscreen === undefined ? true : body.include_offscreen === true,
    });
    sendOk(result);
  },
};

/**
 * When to use: the bridge request handler — dispatch the primitive verbs.
 * Returns false when the method+path pair is not a primitive route.
 */
export async function handlePrimitiveRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
