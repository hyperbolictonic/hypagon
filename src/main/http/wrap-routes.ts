/**
 * The bridge's `/wrap/*` routes (Hypagon REST).
 *
 * Why a module: this family is the only one with its own auth gate, and its
 * nine routes shared a single service guard + token check that every reader had
 * to re-derive from the 1800-line handler. The three "no wrapper named X"
 * responses now come from one helper, so the code and message cannot drift.
 *
 * The auth order is part of the contract and is preserved here: missing
 * service -> 503, bad token -> 401, unknown route -> 404.
 */
import { deriveRecipe } from '../../../packages/recipe/src/index.ts';
import { isWrapAuthorized, tokenFromHeaders } from '../wrap/auth.js';
import { dispatchRoute } from './route-table.js';
import type { WrapStore } from '../wrap/store.js';
import type { SecretStore } from '../wrap/secrets.js';
import type { WrapAuditLog } from '../wrap/audit.js';
import type { WrapCore } from '../wrap/core.js';

/** When to use: wiring the bridge — the wrapper core and the store it serves. */
export interface WrapBridge {
  store: WrapStore;
  executor: WrapCore;
  secrets: SecretStore;
  audit: WrapAuditLog;
  /** Rotated on each app start; the MCP side reads it from `HB_WRAP_TOKEN_FILE` (legacy `KUANG_WRAP_TOKEN_FILE`). */
  token: string;
}

/** When to use: building the wrap dispatcher — request facts and the bridge helpers. */
export interface WrapRouteContext {
  wrap?: WrapBridge;
  method: string | undefined;
  pathname: string;
  url: URL;
  /** Raw request headers; the auth helper extracts the bearer token. */
  headers: Record<string, string | string[] | undefined>;
  readBody: () => Promise<any>;
  sendJson: (data: any, status?: number) => void;
}

type WrapHandler = (wrap: WrapBridge, ctx: WrapRouteContext) => Promise<void> | void;

/** One shape for "that wrapper does not exist", used by get, delete and the GET route. */
const wrapperNotFound = (id: string) => ({
  success: false,
  error: `No wrapper named "${id}".`,
  code: 'WRAPPER_NOT_FOUND',
});

const asId = (value: unknown): string => String(value || '');

const ROUTES: Record<string, WrapHandler> = {
  'GET /wrap/status': (wrap, { sendJson }) => {
    sendJson({ success: true, ...wrap.executor.status() });
  },

  'GET /wrap/manifest': (wrap, { sendJson }) => {
    sendJson({ success: true, wrappers: wrap.store.manifest() });
  },

  'GET /wrap/wrapper': (wrap, { url, sendJson }) => {
    const id = url.searchParams.get('id') || '';
    const wrapper = wrap.store.get(id);
    if (!wrapper) {
      sendJson(wrapperNotFound(id), 404);
      return;
    }
    sendJson({ success: true, wrapper });
  },

  'GET /wrap/secrets': (wrap, { sendJson }) => {
    // Names, hosts, and header names only. Values are never serialised here.
    sendJson({
      success: true,
      available: wrap.secrets.available(),
      warning: wrap.secrets.warning(),
      secrets: wrap.secrets.list(),
    });
  },

  'GET /wrap/audit': (wrap, { url, sendJson }) => {
    const limit = Number(url.searchParams.get('limit')) || 50;
    sendJson({ success: true, entries: wrap.audit.list(limit) });
  },

  'POST /wrap/run': async (wrap, { readBody, sendJson }) => {
    const body = await readBody();
    if (typeof body?.id !== 'string' || !body.id) {
      sendJson({ success: false, error: 'id is required', code: 'BAD_REQUEST' }, 400);
      return;
    }
    const result = await wrap.executor.run(body.id, body.args ?? {}, {
      format: body.format,
      includeRaw: Boolean(body.includeRaw),
      maxPages: body.maxPages !== undefined ? Number(body.maxPages) : undefined,
    });
    // A wrapper error is still a successful bridge round-trip; the MCP layer
    // turns result.ok into the isError flag.
    sendJson(result);
  },

  'POST /wrap/test': async (wrap, { readBody, sendJson }) => {
    const body = await readBody();
    const result = await wrap.executor.test({
      id: typeof body?.id === 'string' ? body.id : undefined,
      wrapper: body?.wrapper,
      args: body?.args,
      sample: body?.sample,
      dryRun: body?.dryRun,
      format: body?.format,
      maxPages: body?.maxPages !== undefined ? Number(body.maxPages) : undefined,
    });
    sendJson(result);
  },

  'POST /wrap/derive': async (wrap, { readBody, sendJson }) => {
    const body = await readBody();
    let sample: unknown = body?.sample;
    let source: 'sample' | 'url' = 'sample';

    // A URL is fetched through the executor, so the same outbound policy applies.
    if ((sample === undefined || sample === null) && typeof body?.url === 'string' && body.url) {
      const fetched = await wrap.executor.test({
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
        sendJson(
          {
            success: false,
            error: fetched.error?.message || `Could not fetch ${body.url}`,
            code: fetched.error?.code || 'FETCH_FAILED',
          },
          400,
        );
        return;
      }
      sample = fetched.response?.json;
      source = 'url';
    }

    if (typeof sample === 'string') {
      try {
        sample = JSON.parse(sample);
      } catch {
        sendJson({ success: false, error: 'sample is not valid JSON', code: 'BAD_REQUEST' }, 400);
        return;
      }
    }

    if (sample === undefined || sample === null) {
      sendJson({ success: false, error: 'Provide a JSON sample or a url to fetch.', code: 'BAD_REQUEST' }, 400);
      return;
    }

    const maxFields = body?.max_fields ?? body?.maxFields;
    const recipe = deriveRecipe(sample, undefined, {
      id: typeof body?.id === 'string' ? body.id : undefined,
      name: typeof body?.name === 'string' ? body.name : undefined,
      description: typeof body?.description === 'string' ? body.description : undefined,
      maxFields: maxFields !== undefined ? Number(maxFields) : undefined,
    });
    sendJson({ success: true, source, recipe });
  },

  'POST /wrap/wrappers': async (wrap, { readBody, sendJson }) => {
    const body = await readBody();
    const action = String(body?.action || '').toLowerCase();

    if (action === 'create' || action === 'update') {
      const result = action === 'create' ? wrap.store.create(body?.wrapper) : wrap.store.update(body?.wrapper);
      sendJson({ success: result.ok, wrapper: result.wrapper, errors: result.errors }, result.ok ? 200 : 400);
      return;
    }

    if (action === 'delete') {
      const id = asId(body?.id);
      const deleted = wrap.store.delete(id);
      sendJson(deleted ? { success: true, deleted } : { ...wrapperNotFound(id), deleted }, deleted ? 200 : 404);
      return;
    }

    if (action === 'get') {
      const id = asId(body?.id);
      const wrapper = wrap.store.get(id);
      if (!wrapper) {
        sendJson(wrapperNotFound(id), 404);
        return;
      }
      sendJson({ success: true, wrapper });
      return;
    }

    sendJson({ success: false, error: 'action must be create, update, delete, or get', code: 'BAD_REQUEST' }, 400);
  },
};

/**
 * When to use: the bridge request handler — dispatch `/wrap/*` (auth first).
 * Returns false only when the path is not a wrap route; a missing service, a
 * rejected token and an unknown endpoint all answer here and claim the request.
 */
export async function handleWrapRoutes(ctx: WrapRouteContext): Promise<boolean> {
  if (!ctx.pathname.startsWith('/wrap/')) return false;
  if (!ctx.wrap) {
    ctx.sendJson({ success: false, error: 'Hypagon REST is not initialised.', code: 'WRAP_UNAVAILABLE' }, 503);
    return true;
  }
  if (!isWrapAuthorized(tokenFromHeaders(ctx.headers), ctx.wrap.token)) {
    ctx.sendJson(
      {
        success: false,
        error: 'Unauthorized. Set HB_WRAP_TOKEN_FILE (or KUANG_WRAP_TOKEN_FILE) to the app-generated token file.',
        code: 'UNAUTHORIZED',
      },
      401,
    );
    return true;
  }
  const service = ctx.wrap;
  return dispatchRoute(ROUTES, ctx, (handler) => handler(service, ctx), {
    error: 'Wrap endpoint not found',
    code: 'NOT_FOUND',
  });
}
