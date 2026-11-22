/**
 * The bridge's `/marks/*` routes — Set-of-Marks interactions.
 *
 * Why a module: `click` and `type` both resolve the mark reference from an
 * eight-alias list (`markId`, `mark_id`, `mark`, `id`, `badge`, `index`,
 * `num`, `number`) and validate it the same way. One `markRef()` owns that
 * rule, so an added alias cannot be forgotten on one route.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type MarkHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/** The mark reference an agent sent, or undefined when nothing numeric is there. */
const markRef = (body: any): number | undefined => {
  const raw = body?.markId ?? body?.mark_id ?? body?.mark ?? body?.id ?? body?.badge ?? body?.index ?? body?.num ?? body?.number;
  if (raw === undefined || Number.isNaN(Number(raw))) return undefined;
  return Number(raw);
};

/** A query flag counts as true for '1' or 'true' (any case). */
const flag = (url: URL, name: string): boolean =>
  ['1', 'true'].includes((url.searchParams.get(name) || '').toLowerCase());

/**
 * Resolve the mark reference from the request body, or answer 400 with the
 * message agents already retry on. Returns undefined once the 400 is sent.
 */
const resolveMark = async (
  { readBody, sendJson }: ChassisRouteContext,
): Promise<{ id: number; body: any } | undefined> => {
  const body = await readBody();
  const id = markRef(body);
  if (id === undefined) {
    sendJson({ success: false, error: 'Must provide valid numeric markId (or mark_id)' }, 400);
    return undefined;
  }
  return { id, body };
};

const ROUTES: Record<string, MarkHandler> = {
  'GET /marks/screenshot': async ({ chassis, url, sendJson }) => {
    const result = await chassis.takeAnnotatedScreenshot({
      economy: flag(url, 'economy'),
      textOnly: flag(url, 'text_only'),
      includeOffscreen: flag(url, 'include_offscreen'),
    });
    sendJson({ success: true, ...result });
  },

  'POST /marks/click': async (ctx) => {
    const resolved = await resolveMark(ctx);
    if (!resolved) return;
    ctx.sendJson({ success: true, result: await ctx.chassis.clickMark(resolved.id) });
  },

  'POST /marks/type': async (ctx) => {
    const resolved = await resolveMark(ctx);
    if (!resolved) return;
    const body = resolved.body;
    const text = body.text ?? body.value ?? body.content ?? body.input ?? '';
    ctx.sendJson({
      success: true,
      result: await ctx.chassis.typeMark(resolved.id, String(text), {
        clearFirst: body?.clear_first === true || body?.clearFirst === true,
      }),
    });
  },
  'GET /marks/list': ({ chassis, sendJson }) => {
    sendJson({ success: true, marks: chassis.getActiveMarks() });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/marks/*`. Returns false
 * when the method+path pair is not a marks route.
 */
export async function handleMarkRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
