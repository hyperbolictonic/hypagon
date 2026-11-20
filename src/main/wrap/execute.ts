/**
 * The executor's run pipeline, in three phases: prepare → fetch pages → compose.
 *
 * This module is the entry point and the error boundary. The phases live in
 * `execute-prepare.ts`, `execute-fetch.ts` and `execute-compose.ts`; their shared inputs are
 * in `execute-deps.ts`.
 *
 * When to use: `WrapExecutor.execute` — the executor owns the options and the transport.
 */
import { clampInt, failure, safeHost } from './render.ts';
import { redactHeaders } from './interpolate.ts';
import { WrapSecurityError } from './security.ts';
import { WrapTransportError } from './response.ts';
import { pagePlan } from './pagination.ts';
import { prepare } from './execute-prepare.ts';
import { fetchPages, type PageRun } from './execute-fetch.ts';
import { compose } from './execute-compose.ts';
import type { ExecuteDeps } from './execute-deps.ts';
import type { ExecuteOptions } from './execution-types.ts';
import type { WrapPreview, WrapRunResult, WrapWrapper } from './types.ts';

export type { ExecuteDeps } from './execute-deps.ts';

/** When to use: `WrapExecutor.execute` — the three phases with one error boundary. */
export async function executeWrapper(
  deps: ExecuteDeps,
  wrapper: WrapWrapper,
  argsInput: unknown,
  options: ExecuteOptions,
): Promise<WrapRunResult> {
  const prepared = await prepare(wrapper, argsInput, deps.secrets);
  if (!prepared.ok) return prepared.result;

  const { built } = prepared.prepared;
  const plan = pagePlan(wrapper, built);
  const maxPages = plan.active ? clampInt(options.maxPages ?? deps.maxPages, 1, deps.maxPages) : 1;
  const itemCap = wrapper.response?.limits?.maxItems ?? deps.defaultMaxItems;

  // The preview must show the URL the first page will actually use, including offset paging.
  let startUrl = built.url;
  if (plan.active && plan.type === 'offset') {
    const firstUrl = new URL(startUrl);
    if (plan.limitParam) firstUrl.searchParams.set(plan.limitParam, String(plan.pageSize));
    firstUrl.searchParams.set(plan.offsetParam ?? 'offset', '0');
    startUrl = firstUrl.toString();
  }

  const request: WrapPreview = {
    method: built.method,
    url: startUrl,
    headers: redactHeaders(built.headers, prepared.prepared.secretHeader ? [prepared.prepared.secretHeader] : []),
    body: built.body,
  };

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      wrapper: { id: wrapper.id, name: wrapper.name },
      request,
      markdown: '_Dry run — request not sent._',
      records: [],
    };
  }

  let run: PageRun;
  try {
    run = await fetchPages({ deps, wrapper, built, plan, maxPages, itemCap, prepared: prepared.prepared, startUrl });
  } catch (err: any) {
    const code =
      err instanceof WrapSecurityError || err instanceof WrapTransportError ? err.code : 'NETWORK_ERROR';
    const retryable = code === 'TIMEOUT' || code === 'NETWORK_ERROR';
    deps.audit?.append({
      wrapper: wrapper.id,
      host: safeHost(built.url),
      method: built.method,
      ok: false,
      code,
    });
    return failure({ id: wrapper.id, name: wrapper.name }, code, err?.message || String(err), request, undefined, retryable);
  }

  return compose({ deps, wrapper, options, request, plan, maxPages, itemCap, run });
}
