/**
 * The skeleton every bridge route family shares.
 *
 * Each family module is a `Record<'METHOD /path', handler>` table plus a guard
 * for the service it fronts. Three details are easy to get subtly different and
 * are therefore owned here once:
 *
 * - the key format (`GET /media/status`), so a table entry and the lookup can
 *   never disagree about spacing or case;
 * - the trailing 404, so an unknown endpoint in any family answers with the
 *   same `{ success: false, error, code }` body;
 * - the boolean result, so the bridge handler knows whether the family claimed
 *   the request and can stop falling through.
 */

/** When to use: a family handler needs the request facts and the bridge's JSON sender. */
export interface RouteTableContext {
  method: string | undefined;
  pathname: string;
  sendJson: (data: any, status?: number) => void;
}

/** When to use: declaring a family's answer for a method+path it does not serve. */
export interface RouteNotFound {
  error: string;
  code?: string;
}

/**
 * When to use: the end of every family handler — look up the entry for this
 * method and path, run it, and report whether the family claimed the request.
 *
 * Omit `notFound` for a family that has no path prefix of its own (its unknown
 * paths should fall through to the bridge's generic 404 instead).
 */
export async function dispatchRoute<H>(
  table: Record<string, H>,
  ctx: RouteTableContext,
  run: (handler: H) => Promise<void> | void,
  notFound?: RouteNotFound,
): Promise<boolean> {
  const handler = table[`${ctx.method} ${ctx.pathname}`];
  if (!handler) {
    if (notFound) ctx.sendJson({ success: false, ...notFound }, 404);
    return Boolean(notFound);
  }
  await run(handler);
  return true;
}
