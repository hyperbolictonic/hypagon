/**
 * The REST executor's run pipeline.
 *
 * `WrapExecutor` owns the store and the public surface; this module owns the
 * steps between a wrapper and a `WrapRunResult`: validate and build, resolve
 * the credential, page the endpoint, render, index, and shape a failure.
 */
import { buildRequest, redactHeaders, BuildRequestError } from './interpolate.ts';
import { validateArgs } from './input-schema.ts';
import { WrapSecurityError } from './security.ts';
import { clampInt, clip, failure, parseJson, redactDeep, redactText, safeHost, secretVariants } from './render.ts';
import { fetchWithPolicy, WrapTransportError, type FetchedResponse } from './transport.ts';
import { renderWrapped, type Rendered } from './rendering.ts';
import {
  documentsToIndex,
  itemsOf,
  mergePages,
  nextPageToken,
  pagePlan,
  sameOrigin,
  type PagePlan,
  type WrapIndexContext,
  type WrapIndexDocument,
} from './pagination.ts';
import type { WrapLimits } from './limits.ts';
import type { WrapFormat, WrapPreview, WrapRunResult, WrapWrapper } from './types.ts';
import type { SecretStore } from './secrets.ts';
import type { WrapAuditLog } from './audit.ts';

/** Per-call switches: dry run, raw payload and the page override. */
export interface ExecuteOptions {
  dryRun: boolean;
  includeRaw: boolean;
  format: WrapFormat;
  /** Per-call override of the executor's page cap. */
  maxPages?: number;
}

/** Shared state every run step needs, assembled by the executor. */
export interface ExecuteContext {
  transport: WrapLimits;
  maxPages: number;
  defaultMaxItems: number;
  secrets?: Pick<SecretStore, 'resolve'>;
  audit?: Pick<WrapAuditLog, 'append'>;
  indexDocuments?: (documents: WrapIndexDocument[], context: WrapIndexContext) => Promise<number>;
  touchVerified(id: string): void;
}

interface PreparedCall {
  built: ReturnType<typeof buildRequest>;
  secretHeader?: string;
  secretValues: string[];
  secretRefreshable: boolean;
}

interface PageRun {
  pages: FetchedResponse[];
  rawPages: unknown[];
  failed?: FetchedResponse;
  more: boolean;
}

/** Validate the agent's args and resolve the credential before a request exists. */
async function prepareCall(
  ctx: ExecuteContext,
  wrapper: WrapWrapper,
  argsInput: unknown,
): Promise<{ ok: true; call: PreparedCall } | { ok: false; result: WrapRunResult }> {
  const validated = validateArgs(wrapper.inputSchema, argsInput);
  if (!validated.ok) {
    return {
      ok: false,
      result: failure(
        { id: wrapper.id, name: wrapper.name },
        'INVALID_ARGS',
        validated.errors.join('; '),
        undefined,
        validated.field,
      ),
    };
  }

  let built;
  try {
    built = buildRequest(wrapper, validated.value);
  } catch (err: any) {
    const code = err instanceof BuildRequestError ? err.code : 'INVALID_REQUEST';
    return { ok: false, result: failure({ id: wrapper.id, name: wrapper.name }, code, err?.message || String(err)) };
  }

  const call: PreparedCall = { built, secretValues: [], secretRefreshable: false };
  if (!wrapper.request.auth) return { ok: true, call };
  if (!ctx.secrets) {
    return {
      ok: false,
      result: failure(
        { id: wrapper.id, name: wrapper.name },
        'SECRETS_UNAVAILABLE',
        'This build has no secret store; remove request.auth or use a credential-free endpoint.',
      ),
    };
  }

  const host = new URL(built.url).hostname;
  const resolved = await ctx.secrets.resolve(wrapper.request.auth, host);
  if (!resolved.ok || !resolved.header || resolved.value === undefined) {
    return {
      ok: false,
      result: failure(
        { id: wrapper.id, name: wrapper.name },
        resolved.code || 'SECRET_ERROR',
        resolved.message || `Could not resolve secret "${wrapper.request.auth}".`,
      ),
    };
  }

  built.headers[resolved.header] = resolved.value;
  call.secretHeader = resolved.header;
  call.secretValues = secretVariants(resolved.value);
  call.secretRefreshable = Boolean(resolved.refreshable);
  return { ok: true, call };
}

/** Offset paging starts at zero, with the recipe's page size applied. */
function firstPageUrl(built: { url: string }, plan: PagePlan): string {
  if (!plan.active || plan.type !== 'offset') return built.url;
  const url = new URL(built.url);
  if (plan.limitParam) url.searchParams.set(plan.limitParam, String(plan.pageSize));
  url.searchParams.set(plan.offsetParam ?? 'offset', '0');
  return url.toString();
}

function previewRequest(
  built: ReturnType<typeof buildRequest>,
  url: string,
  secretHeader?: string,
): WrapPreview {
  return {
    method: built.method,
    url,
    headers: redactHeaders(built.headers, secretHeader ? [secretHeader] : []),
    body: built.body,
  };
}

interface PageAttempt {
  fetched: FetchedResponse;
  /** The credential was re-minted; the caller retries the same page once. */
  retried?: boolean;
}

/** Fetch one page, audit it, and re-mint a rejected OAuth2 credential once. */
async function fetchOnePage(
  ctx: ExecuteContext,
  wrapper: WrapWrapper,
  call: PreparedCall,
  url: string,
  authRetried: boolean,
): Promise<PageAttempt> {
  const fetched = await fetchWithPolicy(ctx.transport, wrapper, { ...call.built, url }, call.secretHeader);
  const pageOk = fetched.response.ok;

  ctx.audit?.append({
    wrapper: wrapper.id,
    host: safeHost(fetched.url),
    method: call.built.method,
    status: fetched.response.status,
    ok: pageOk,
    bytes: fetched.bytes,
    durationMs: fetched.durationMs,
    code: pageOk ? undefined : 'HTTP_ERROR',
  });

  if (pageOk) return { fetched };

  // One re-mint for an OAuth2 credential the API rejected, then give up with AUTH_REQUIRED.
  const rejected = fetched.response.status === 401 || fetched.response.status === 403;
  if (!rejected || !call.secretRefreshable || authRetried || !wrapper.request.auth || !ctx.secrets) {
    return { fetched };
  }

  const refreshed = await ctx.secrets.resolve(wrapper.request.auth, safeHost(url), { forceRefresh: true });
  if (!refreshed.ok || !refreshed.header || refreshed.value === undefined) return { fetched };

  call.built.headers[refreshed.header] = refreshed.value;
  call.secretHeader = refreshed.header;
  call.secretValues = secretVariants(refreshed.value);
  return { fetched, retried: true };
}

/** The next page URL for cursor/offset/link paging, or null when a link escapes the origin. */
function nextPageUrl(
  plan: PagePlan,
  next: string | true,
  url: string,
  offset: number,
): { url: string; offset: number } | null {
  if (plan.type === 'link') {
    const candidate = String(next);
    // A page link must stay on the origin the wrapper was written for.
    return sameOrigin(candidate, url) ? { url: candidate, offset } : null;
  }

  const pageUrl = new URL(url);
  let nextOffset = offset;
  if (plan.type === 'offset') {
    nextOffset += plan.pageSize;
    pageUrl.searchParams.set(plan.offsetParam ?? 'offset', String(nextOffset));
    if (plan.limitParam) pageUrl.searchParams.set(plan.limitParam, String(plan.pageSize));
  } else if (plan.type === 'cursor') {
    pageUrl.searchParams.set(plan.cursorParam ?? 'cursor', String(next));
  }
  return { url: pageUrl.toString(), offset: nextOffset };
}

/** Fetch pages until the recipe says stop, an error lands, or the caps are reached. */
async function runPages(
  ctx: ExecuteContext,
  wrapper: WrapWrapper,
  call: PreparedCall,
  plan: PagePlan,
  maxPages: number,
  itemCap: number,
  initialUrl: string,
  request: WrapPreview,
): Promise<{ ok: true; run: PageRun } | { ok: false; result: WrapRunResult }> {
  const pages: FetchedResponse[] = [];
  const rawPages: unknown[] = [];
  let url = initialUrl;
  let offset = 0;
  let accumulated = 0;
  let more = false;
  let failed: FetchedResponse | undefined;
  let authRetried = false;

  try {
    for (let index = 0; index < maxPages; index++) {
      const attempt = await fetchOnePage(ctx, wrapper, call, url, authRetried);
      if (attempt.retried) {
        authRetried = true;
        index -= 1; // retry this page once
        continue;
      }

      const fetched = attempt.fetched;
      pages.push(fetched);
      if (!fetched.response.ok) {
        failed = fetched;
        break;
      }

      const json = parseJson(fetched.text, fetched.contentType);
      const safeJson = json === undefined ? undefined : redactDeep(json, call.secretValues);
      rawPages.push(safeJson);
      if (!plan.active) break;

      // Auto-paging only makes sense for a list selection.
      const items = itemsOf(wrapper.response, safeJson);
      if (!items || items.length === 0) {
        more = false;
        break;
      }
      accumulated += items.length;

      const next = nextPageToken(plan, safeJson, items.length);
      if (next === null) {
        more = false;
        break;
      }
      if (accumulated >= itemCap || index + 1 >= maxPages) {
        more = true;
        break;
      }

      const advanced = nextPageUrl(plan, next, url, offset);
      if (!advanced) {
        more = true;
        break;
      }
      url = advanced.url;
      offset = advanced.offset;
      more = true;
    }
  } catch (err: any) {
    const code =
      err instanceof WrapSecurityError || err instanceof WrapTransportError ? err.code : 'NETWORK_ERROR';
    const retryable = code === 'TIMEOUT' || code === 'NETWORK_ERROR';
    ctx.audit?.append({ wrapper: wrapper.id, host: safeHost(url), method: call.built.method, ok: false, code });
    return {
      ok: false,
      result: failure(
        { id: wrapper.id, name: wrapper.name },
        code,
        err?.message || String(err),
        request,
        undefined,
        retryable,
      ),
    };
  }

  return { ok: true, run: { pages, rawPages, failed, more } };
}

function renderPages(
  wrapper: WrapWrapper,
  pages: FetchedResponse[],
  rawPages: unknown[],
  secretValues: string[],
  itemCap: number,
  maxChars: number,
): Rendered {
  const first = pages[0];
  const safeFirstText = redactText(first.text, secretValues);
  return rawPages.length > 1
    ? mergePages(wrapper, rawPages, itemCap, maxChars)
    : renderWrapped(wrapper, rawPages[0], safeFirstText, first.contentType, maxChars);
}

/** Opt-in Cortex indexing; a failure is reported, never fatal. */
async function indexRun(
  ctx: ExecuteContext,
  wrapper: WrapWrapper,
  rendered: Rendered,
  pageUrl: string,
): Promise<WrapRunResult['indexed']> {
  if (wrapper.response?.index !== 'cortex' || !ctx.indexDocuments) return undefined;
  const documents = documentsToIndex(wrapper, rendered);
  if (documents.length === 0) return undefined;

  try {
    const chunks = await ctx.indexDocuments(documents, {
      wrapperId: wrapper.id,
      wrapperName: wrapper.name,
      url: pageUrl,
    });
    return { documents: documents.length, chunks };
  } catch (err: any) {
    return { documents: documents.length, chunks: 0, error: err?.message || String(err) };
  }
}

function applyHttpError(
  result: WrapRunResult,
  wrapper: WrapWrapper,
  failedPage: FetchedResponse,
  secretValues: string[],
): void {
  const status = failedPage.response.status;
  const message = `HTTP ${status}${failedPage.response.statusText ? ` ${failedPage.response.statusText}` : ''}`;
  const excerpt = clip(redactText(failedPage.text, secretValues), 600);
  const authRejected = status === 401 || status === 403;
  const credential = wrapper.request.auth ? ` "${wrapper.request.auth}"` : '';

  if (authRejected) {
    const hint = `Credential${credential} was rejected (HTTP ${status}). Refresh it in Settings → Wrappers, or raise request_human_intervention.`;
    result.markdown = `**AUTH_REQUIRED** — ${hint}${excerpt ? `\n\n\`\`\`\n${excerpt}\n\`\`\`` : ''}`;
  } else {
    result.markdown = excerpt ? `**${message}**\n\n\`\`\`\n${excerpt}\n\`\`\`` : `**${message}**`;
  }

  result.records = [];
  result.error = {
    code: authRejected ? 'AUTH_REQUIRED' : 'HTTP_ERROR',
    message: authRejected
      ? `Credential${credential} was rejected with HTTP ${status}. Refresh it in Settings → Wrappers, or raise request_human_intervention.`
      : excerpt
        ? `${message}: ${excerpt}`
        : message,
    status,
    retryable: !authRejected && (status === 429 || status >= 500),
  };
}

function assembleResult(
  ctx: ExecuteContext,
  wrapper: WrapWrapper,
  request: WrapPreview,
  run: PageRun,
  rendered: Rendered,
  plan: PagePlan,
  maxPages: number,
  options: ExecuteOptions,
  indexed: WrapRunResult['indexed'],
  secretValues: string[],
): WrapRunResult {
  const { pages, rawPages } = run;
  const first = pages[0];
  const failedPage = run.failed ?? first;
  const firstJson = rawPages[0];
  const ok = !run.failed && pages.every((page) => page.response.ok);

  const result: WrapRunResult = {
    ok,
    status: failedPage.response.status,
    durationMs: pages.reduce((total, page) => total + page.durationMs, 0),
    wrapper: { id: wrapper.id, name: wrapper.name },
    request,
    response: {
      contentType: first.contentType || undefined,
      bytes: pages.reduce((total, page) => total + page.bytes, 0),
      truncated: pages.some((page) => page.truncated) || undefined,
      text: ok && firstJson !== undefined ? undefined : clip(redactText(first.text, secretValues), 1_000),
      json: options.includeRaw ? firstJson : undefined,
    },
    markdown: rendered.markdown,
    records: rendered.records,
    documents: rendered.documents,
    meta: rendered.meta,
    paging: plan.active ? { pages: pages.length, cap: maxPages, more: run.more } : undefined,
    indexed,
  };

  if (!ok) {
    applyHttpError(result, wrapper, failedPage, secretValues);
  } else {
    // A live success is the verification signal surfaced as `lastVerified`.
    try {
      ctx.touchVerified(wrapper.id);
    } catch {
      /* verification metadata is best-effort */
    }
  }

  return result;
}

/** Run one wrapper call end to end. */
export async function executeWrapper(
  ctx: ExecuteContext,
  wrapper: WrapWrapper,
  argsInput: unknown,
  options: ExecuteOptions,
): Promise<WrapRunResult> {
  const prepared = await prepareCall(ctx, wrapper, argsInput);
  if (!prepared.ok) return prepared.result;
  const { call } = prepared;

  const plan = pagePlan(wrapper, call.built);
  const maxPages = plan.active ? clampInt(options.maxPages ?? ctx.maxPages, 1, ctx.maxPages) : 1;
  const itemCap = wrapper.response?.limits?.maxItems ?? ctx.defaultMaxItems;
  const url = firstPageUrl(call.built, plan);
  const request = previewRequest(call.built, url, call.secretHeader);

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

  const run = await runPages(ctx, wrapper, call, plan, maxPages, itemCap, url, request);
  if (!run.ok) return run.result;

  const rendered = renderPages(
    wrapper,
    run.run.pages,
    run.run.rawPages,
    call.secretValues,
    itemCap,
    ctx.transport.maxResultChars,
  );
  const ok = !run.run.failed && run.run.pages.every((page) => page.response.ok);
  const indexed = ok ? await indexRun(ctx, wrapper, rendered, run.run.pages[0].url) : undefined;

  return assembleResult(
    ctx,
    wrapper,
    request,
    run.run,
    rendered,
    plan,
    maxPages,
    options,
    indexed,
    call.secretValues,
  );
}
