/**
 * The bridge's navigation and direct-input routes.
 *
 * Why one module: these are the mutating page primitives the agent calls
 * between observations — navigate, dismiss a consent wall, click, type, fill,
 * press, scroll and history. They share one contract (`{ success, result }`
 * plus a 400 on a malformed target) and the same JEV nudge after a navigation,
 * so the nudge and the validation live here once instead of in the main
 * handler.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type NavHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

const ROUTES: Record<string, NavHandler> = {
  'POST /navigate': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const autoDismiss = body.autoDismissConsent !== undefined ? Boolean(body.autoDismissConsent) : true;
    let targetUrl = body.url || body.destination || body.target || body.link || '';
    if (
      targetUrl &&
      !/^https?:\/\//i.test(targetUrl) &&
      !/^about:/i.test(targetUrl) &&
      !/^mark-eleven:/i.test(targetUrl)
    ) {
      targetUrl = 'https://' + targetUrl;
    }
    const result = await chassis.nav.navigateTo(targetUrl, autoDismiss);
    // Live nudge at the moment reading starts: the index is cheap, the dump is not.
    const guided = chassis.jev.isEnforced()
      ? `${result} | JEV ENFORCED: unscoped page reads are refused. Call jev_index, then read_section for only what you need.`
      : chassis.jev.isEnabled()
        ? `${result} | JEV ACTIVE: call jev_index before reading this page, then read_section for only what you need.`
        : result;
    sendOk({ result: guided });
  },

  'POST /shield/dismiss': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const result = await chassis.consent.dismiss({
      policy: body?.policy,
      forceRemove: body?.force_remove === true || body?.forceRemove === true,
    });
    sendOk({ result });
  },

  'POST /click': async ({ chassis, readBody, sendJson, sendOk }) => {
    const body = await readBody();
    const selector = body.selector || body.element || body.target || body.css;
    const x = body.x !== undefined ? Number(body.x) : undefined;
    const y = body.y !== undefined ? Number(body.y) : undefined;
    const coords = x !== undefined && !isNaN(x) && y !== undefined && !isNaN(y) ? { x, y } : undefined;
    if (!selector && !coords) {
      sendJson({ success: false, error: 'Must provide either "selector" or coordinates (x, y)' }, 400);
      return;
    }
    sendOk({ result: await chassis.clickElement(selector, coords) });
  },

  'POST /type': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    const selector = body.selector || body.element || body.target;
    const text = body.text ?? body.value ?? body.content ?? body.input ?? '';
    sendOk({ result: await chassis.typeText(String(text), selector) });
  },

  'POST /form/fill': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk({ result: await chassis.fillForm(body.fields || {}, body.submitSelector) });
  },

  'POST /press-key': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk({ result: await chassis.pressKey(body.key) });
  },

  'POST /scroll': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    sendOk({ result: await chassis.scrollPage(body.direction || 'down', body.amount || 400) });
  },

  'POST /history': async ({ chassis, readBody, sendOk }) => {
    const body = await readBody();
    let result = '';
    if (body.action === 'back') result = await chassis.nav.goBack();
    else if (body.action === 'forward') result = await chassis.nav.goForward();
    else if (body.action === 'reload') result = await chassis.nav.reload();
    sendOk({ result });
  },
};

/**
 * When to use: the bridge request handler — dispatch navigation and direct
 * input. Returns false when the method+path pair is not a navigation route.
 */
export async function handleNavRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
