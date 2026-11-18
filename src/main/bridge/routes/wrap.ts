/**
 * Hypagon REST (`/wrap/*`) routes.
 *
 * Wrapper execution is authenticated with the rotated local token, then delegated
 * to the wrap store/executor. A wrapper-level failure is still an HTTP 200; the
 * MCP layer maps `result.ok` to the tool error flag.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import { isWrapAuthorized, tokenFromHeaders } from '../../wrap/auth.js';
import { deriveRecipe } from '../../../../packages/recipe/src/index.ts';
import type { BridgeContext } from '../context.js';
import { dispatchRouteTable, type TableHandler } from '../dispatch.js';

type Handler = TableHandler;

const UNAUTHORIZED_MESSAGE =
  'Unauthorized. Set HB_WRAP_TOKEN_FILE (or KUANG_WRAP_TOKEN_FILE) to the app-generated token file.';

/** Derive a recipe from either a supplied sample or a URL fetched through the executor. */
async function resolveSample(ctx: BridgeContext): Promise<{ sample: unknown; source: 'sample' | 'url' } | null> {
  const body = await ctx.body();
  let sample: unknown = body?.sample;
  let source: 'sample' | 'url' = 'sample';

  // A URL is fetched through the executor, so the same outbound policy applies.
  if ((sample === undefined || sample === null) && typeof body?.url === 'string' && body.url) {
    const fetched = await ctx.wrap!.executor.test({
      wrapper: {
        schemaVersion: 1,
        id: 'derive.sample',
        name: 'derive sample',
        request: { method: 'GET', url: body.url },
      },
      args: {},
      dryRun: false,
      includeRaw: true,
      maxPages: 1,
    });
    if (fetched.ok !== true) {
      ctx.fail(
        fetched.error?.message || `Could not fetch ${body.url}`,
        400,
        fetched.error?.code || 'FETCH_FAILED',
      );
      return null;
    }
    sample = fetched.response?.json;
    source = 'url';
  }

  if (typeof sample === 'string') {
    try {
      sample = JSON.parse(sample);
    } catch {
      ctx.fail('sample is not valid JSON', 400, 'BAD_REQUEST');
      return null;
    }
  }

  if (sample === undefined || sample === null) {
    ctx.fail('Provide a JSON sample or a url to fetch.', 400, 'BAD_REQUEST');
    return null;
  }
  return { sample, source };
}

const ROUTES: Record<string, Handler> = {
  'GET /wrap/status': async (ctx) => {
    ctx.json({ success: true, ...ctx.wrap!.executor.status() });
  },

  'GET /wrap/manifest': async (ctx) => {
    ctx.json({ success: true, wrappers: ctx.wrap!.store.manifest() });
  },

  'GET /wrap/wrapper': async (ctx) => {
    const id = ctx.url.searchParams.get('id') || '';
    const wrapper = ctx.wrap!.store.get(id);
    if (!wrapper) {
      ctx.fail(`No wrapper named "${id}".`, 404, 'WRAPPER_NOT_FOUND');
      return;
    }
    ctx.json({ success: true, wrapper });
  },

  'GET /wrap/secrets': async (ctx) => {
    // Names, hosts, and header names only. Values are never serialised here.
    const secrets = ctx.wrap!.secrets;
    ctx.json({
      success: true,
      available: secrets.available(),
      warning: secrets.warning(),
      secrets: secrets.list(),
    });
  },

  'GET /wrap/audit': async (ctx) => {
    const limit = Number(ctx.url.searchParams.get('limit')) || 50;
    ctx.json({ success: true, entries: ctx.wrap!.audit.list(limit) });
  },

  'POST /wrap/run': async (ctx) => {
    const body = await ctx.body();
    if (typeof body?.id !== 'string' || !body.id) {
      ctx.fail('id is required', 400, 'BAD_REQUEST');
      return;
    }
    const result = await ctx.wrap!.executor.run(body.id, body.args ?? {}, {
      format: body.format,
      includeRaw: Boolean(body.includeRaw),
      maxPages: body.maxPages !== undefined ? Number(body.maxPages) : undefined,
    });
    // A wrapper error is still a successful bridge round-trip; the MCP
    // layer turns result.ok into the isError flag.
    ctx.json(result);
  },

  'POST /wrap/test': async (ctx) => {
    const body = await ctx.body();
    const result = await ctx.wrap!.executor.test({
      id: typeof body?.id === 'string' ? body.id : undefined,
      wrapper: body?.wrapper,
      args: body?.args,
      sample: body?.sample,
      dryRun: body?.dryRun,
      format: body?.format,
      maxPages: body?.maxPages !== undefined ? Number(body.maxPages) : undefined,
    });
    ctx.json(result);
  },

  'POST /wrap/derive': async (ctx) => {
    const resolved = await resolveSample(ctx);
    if (!resolved) return;
    const body = await ctx.body();
    const maxFields = body?.max_fields ?? body?.maxFields;
    const recipe = deriveRecipe(resolved.sample, undefined, {
      id: typeof body?.id === 'string' ? body.id : undefined,
      name: typeof body?.name === 'string' ? body.name : undefined,
      description: typeof body?.description === 'string' ? body.description : undefined,
      maxFields: maxFields !== undefined ? Number(maxFields) : undefined,
    });
    ctx.json({ success: true, source: resolved.source, recipe });
  },

  'POST /wrap/wrappers': async (ctx) => {
    const body = await ctx.body();
    const action = String(body?.action || '').toLowerCase();

    if (action === 'create' || action === 'update') {
      const result = action === 'create' ? ctx.wrap!.store.create(body?.wrapper) : ctx.wrap!.store.update(body?.wrapper);
      ctx.json({ success: result.ok, wrapper: result.wrapper, errors: result.errors }, result.ok ? 200 : 400);
      return;
    }

    if (action === 'delete') {
      const deleted = ctx.wrap!.store.delete(String(body?.id || ''));
      ctx.json(
        deleted
          ? { success: true, deleted }
          : { success: false, deleted, error: `No wrapper named "${body?.id || ''}".`, code: 'WRAPPER_NOT_FOUND' },
        deleted ? 200 : 404,
      );
      return;
    }

    if (action === 'get') {
      const wrapper = ctx.wrap!.store.get(String(body?.id || ''));
      if (!wrapper) {
        ctx.fail(`No wrapper named "${body?.id || ''}".`, 404, 'WRAPPER_NOT_FOUND');
        return;
      }
      ctx.json({ success: true, wrapper });
      return;
    }

    ctx.fail('action must be create, update, delete, or get', 400, 'BAD_REQUEST');
  },
};

/** When to use: the request targets `/wrap/*`; handles auth and returns false for other paths. */
export async function handleWrapRoutes(ctx: BridgeContext): Promise<boolean> {
  if (!ctx.pathname.startsWith('/wrap/')) return false;

  const wrap = ctx.wrap;
  if (!wrap) {
    ctx.fail('Hypagon REST is not initialised.', 503, 'WRAP_UNAVAILABLE');
    return true;
  }
  if (!isWrapAuthorized(tokenFromHeaders(ctx.req.headers), wrap.token)) {
    ctx.fail(UNAUTHORIZED_MESSAGE, 401, 'UNAUTHORIZED');
    return true;
  }

  return await dispatchRouteTable(ctx, ROUTES, ctx.pathname, 'Wrap endpoint not found');
}
