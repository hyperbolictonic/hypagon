/**
 * Route-table dispatch shared by the bridge families.
 *
 * A family owns a `"METHOD /path"` table and one prefix; this helper keeps the
 * prefix guard, 404 shape and "handled" return value identical everywhere.
 */

import type { BridgeContext } from './context.js';

/** When to use: a route family hands control back to the bridge when the path is outside its prefix. */
export type TableHandler = (ctx: BridgeContext) => Promise<void>;

/** When to use: dispatch a request against a family route table; false means "not my prefix". */
export async function dispatchRouteTable(
  ctx: BridgeContext,
  routes: Record<string, TableHandler>,
  prefix: string,
  notFound: string,
): Promise<boolean> {
  if (!ctx.pathname.startsWith(prefix)) return false;
  const handler = routes[`${ctx.method} ${ctx.pathname}`];
  if (!handler) {
    ctx.fail(notFound, 404, 'NOT_FOUND');
    return true;
  }
  await handler(ctx);
  return true;
}
