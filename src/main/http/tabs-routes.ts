/**
 * The bridge's `/tabs` routes.
 *
 * Why a module: four handlers, and two of them (`switch`, `close`) carried the
 * same tab-id normalisation — agents send `tabId`, `tab_id`, `tab`, `id`, or
 * the bare number, and every spelling had to become `tab_<n>` before the
 * chassis call. One `tabRef()` now owns that rule.
 */
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

type TabHandler = (ctx: ChassisRouteContext) => Promise<void> | void;

/**
 * The tab reference an agent sent, canonicalised to `tab_<n>`. Numbers and
 * numeric strings get the prefix; anything already prefixed (or absent) passes
 * through unchanged — `close` treats a missing id as "the active tab".
 */
const tabRef = (body: any): any => {
  const raw = body?.tabId ?? body?.tab_id ?? body?.tab ?? body?.id;
  if (typeof raw === 'number') return `tab_${raw}`;
  if (raw && !String(raw).startsWith('tab_') && !Number.isNaN(Number(raw))) return `tab_${raw}`;
  return raw;
};

/** `GET /tabs` and its explicit `list` alias serve the same summary. */
const listTabs: TabHandler = ({ chassis, sendJson }) => {
  sendJson({ success: true, tabs: chassis.tabs.getTabsSummary() });
};

const ROUTES: Record<string, TabHandler> = {
  'GET /tabs': listTabs,
  'GET /tabs/list': listTabs,

  'POST /tabs/new': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    sendJson({ success: true, tab: chassis.createTab(body.url) });
  },

  'POST /tabs/switch': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const id = tabRef(body);
    chassis.switchTab(id);
    sendJson({ success: true, message: `Switched to tab ${id}` });
  },

  'POST /tabs/close': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const id = tabRef(body);
    chassis.closeTab(id);
    sendJson({ success: true, message: `Closed tab ${id || 'active'}` });
  },
};

/**
 * When to use: the bridge request handler — dispatch `/tabs/*`. Returns false
 * when the method+path pair is not a tab route.
 */
export async function handleTabRoutes(ctx: ChassisRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
