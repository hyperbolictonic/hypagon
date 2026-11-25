/**
 * The REST executor.
 *
 * It validates the agent's arguments, builds the request deterministically,
 * applies the outbound policy, fetches, and renders the response through the
 * recipe. It never sees a secret in this slice; the secret store arrives in S2
 * and will keep values in the main process, not here.
 */

import { validateArgs } from './input-schema.ts';
import { buildRequest, redactHeaders, BuildRequestError } from './interpolate.ts';
import { WrapSecurityError } from './security.ts';
import { resolveWrapLimits, type WrapLimits, type WrapTransportOptions } from './limits.ts';
import { resolveWrapper } from './resolve.ts';
import {
  clampInt,
  clip,
  failure,
  parseJson,
  redactDeep,
  redactText,
  safeHost,
  secretVariants,
} from './render.ts';
import { fetchWithPolicy, WrapTransportError, type FetchedResponse } from './transport.ts';
import { renderWrapped } from './rendering.ts';
import {
  documentsToIndex,
  itemsOf,
  mergePages,
  nextPageToken,
  pagePlan,
  sameOrigin,
  type WrapIndexDocument,
} from './pagination.ts';
import type { WrapFormat, WrapPreview, WrapRunResult, WrapWrapper } from './types.ts';
import type { WrapStore } from './store.ts';
import type { SecretStore } from './secrets.ts';
import type { WrapAuditLog } from './audit.ts';

export type { WrapIndexDocument };
export { WrapTransportError };

export interface WrapIndexContext {
  wrapperId: string;
  wrapperName: string;
  /** The URL the content came from (the first page of a paginated run). */
  url: string;
}

export interface ExecutorOptions extends WrapTransportOptions {
  /** Maximum pages followed when a recipe declares pagination. Default 10, capped at 25. */
  maxPages?: number;
  /** Overall item cap for a paginated run when the recipe has no `limits.maxItems`. Default 50. */
  maxItems?: number;
  /**
   * Opt-in sink for recipes with `response.index: "cortex"`. Best-effort: a throw is
   * reported in `result.indexed.error` and never fails the call.
   */
  indexDocuments?: (documents: WrapIndexDocument[], context: WrapIndexContext) => Promise<number>;
  secrets?: Pick<SecretStore, 'resolve'>;
  audit?: Pick<WrapAuditLog, 'append'>;
}

interface ExecuteOptions {
  dryRun: boolean;
  includeRaw: boolean;
  format: WrapFormat;
  /** Per-call override of the executor's page cap. */
  maxPages?: number;
}

/** Overall item cap when a recipe does not declare `limits.maxItems` (mirrors the renderer). */
const DEFAULT_MAX_ITEMS = 50;

export class WrapExecutor {
  readonly store: WrapStore;
  private readonly transport: WrapLimits;
  private readonly maxPages: number;
  private readonly defaultMaxItems: number;
  private readonly indexDocuments?: (documents: WrapIndexDocument[], context: WrapIndexContext) => Promise<number>;
  private readonly secrets?: Pick<SecretStore, 'resolve'>;
  private readonly audit?: Pick<WrapAuditLog, 'append'>;

  constructor(store: WrapStore, options: ExecutorOptions = {}) {
    this.store = store;
    this.transport = resolveWrapLimits(options);
    this.maxPages = clampInt(options.maxPages ?? 10, 1, 25);
    this.defaultMaxItems = clampInt(options.maxItems ?? DEFAULT_MAX_ITEMS, 1, 5_000);
    this.indexDocuments = options.indexDocuments;
    this.secrets = options.secrets;
    this.audit = options.audit;
  }

  status(): { wrappers: number; allowPrivateHosts: boolean } {
    return { wrappers: this.store.count(), allowPrivateHosts: this.transport.allowPrivateHosts };
  }

  async run(
    id: string,
    args: unknown,
    options: { format?: WrapFormat; includeRaw?: boolean; maxPages?: number } = {},
  ): Promise<WrapRunResult> {
    const wrapper = this.store.get(id);
    if (!wrapper) return failure({ id, name: id }, 'WRAPPER_NOT_FOUND', `No wrapper named "${id}".`);

    return this.execute(wrapper, args, {
      dryRun: false,
      includeRaw: Boolean(options.includeRaw),
      format: options.format || 'markdown',
      maxPages: options.maxPages,
    });
  }

  async preview(id: string, args: unknown): Promise<WrapRunResult> {
    const wrapper = this.store.get(id);
    if (!wrapper) return failure({ id, name: id }, 'WRAPPER_NOT_FOUND', `No wrapper named "${id}".`);
    return this.execute(wrapper, args, { dryRun: true, includeRaw: false, format: 'markdown' });
  }

  async test(input: {
    id?: string;
    wrapper?: unknown;
    args?: unknown;
    sample?: unknown;
    dryRun?: boolean;
    format?: WrapFormat;
    maxPages?: number;
    includeRaw?: boolean;
  }): Promise<WrapRunResult> {
    const resolved = this.resolve(input.id, input.wrapper);
    if (!resolved.wrapper) return failure({ id: input.id || '(unsaved)', name: input.id || '(unsaved)' }, resolved.code, resolved.message);

    if (input.sample !== undefined) {
      return this.renderSample(resolved.wrapper, input.sample);
    }

    return this.execute(resolved.wrapper, input.args, {
      dryRun: input.dryRun !== false,
      includeRaw: Boolean(input.includeRaw),
      format: input.format || 'markdown',
      maxPages: input.maxPages,
    });
  }

  private async execute(wrapper: WrapWrapper, argsInput: unknown, options: ExecuteOptions): Promise<WrapRunResult> {
    const validated = validateArgs(wrapper.inputSchema, argsInput);
    if (!validated.ok) {
      return failure(
        { id: wrapper.id, name: wrapper.name },
        'INVALID_ARGS',
        validated.errors.join('; '),
        undefined,
        validated.field,
      );
    }

    let built;
    try {
      built = buildRequest(wrapper, validated.value);
    } catch (err: any) {
      const code = err instanceof BuildRequestError ? err.code : 'INVALID_REQUEST';
      return failure({ id: wrapper.id, name: wrapper.name }, code, err?.message || String(err));
    }

    let secretHeader: string | undefined;
    let secretValues: string[] = [];
    let secretRefreshable = false;
    if (wrapper.request.auth) {
      if (!this.secrets) {
        return failure(
          { id: wrapper.id, name: wrapper.name },
          'SECRETS_UNAVAILABLE',
          'This build has no secret store; remove request.auth or use a credential-free endpoint.',
        );
      }

      const host = new URL(built.url).hostname;
      const resolved = await this.secrets.resolve(wrapper.request.auth, host);
      if (!resolved.ok || !resolved.header || resolved.value === undefined) {
        return failure(
          { id: wrapper.id, name: wrapper.name },
          resolved.code || 'SECRET_ERROR',
          resolved.message || `Could not resolve secret "${wrapper.request.auth}".`,
        );
      }

      built.headers[resolved.header] = resolved.value;
      secretHeader = resolved.header;
      secretValues = secretVariants(resolved.value);
      secretRefreshable = Boolean(resolved.refreshable);
    }

    const plan = pagePlan(wrapper, built);
    const maxPages = plan.active ? clampInt(options.maxPages ?? this.maxPages, 1, this.maxPages) : 1;
    const itemCap = wrapper.response?.limits?.maxItems ?? this.defaultMaxItems;

    let url = built.url;
    let offset = 0;
    if (plan.active && plan.type === 'offset') {
      const firstUrl = new URL(url);
      if (plan.limitParam) firstUrl.searchParams.set(plan.limitParam, String(plan.pageSize));
      firstUrl.searchParams.set(plan.offsetParam ?? 'offset', '0');
      url = firstUrl.toString();
    }

    const request: WrapPreview = {
      method: built.method,
      url,
      headers: redactHeaders(built.headers, secretHeader ? [secretHeader] : []),
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

    const pages: FetchedResponse[] = [];
    const rawPages: unknown[] = [];
    let accumulated = 0;
    let more = false;
    let failed: FetchedResponse | undefined;
    let authRetried = false;

    try {
      for (let index = 0; index < maxPages; index++) {
        const fetched = await fetchWithPolicy(this.transport, wrapper, { ...built, url }, secretHeader);
        const pageOk = fetched.response.ok;

        this.audit?.append({
          wrapper: wrapper.id,
          host: safeHost(fetched.url),
          method: built.method,
          status: fetched.response.status,
          ok: pageOk,
          bytes: fetched.bytes,
          durationMs: fetched.durationMs,
          code: pageOk ? undefined : 'HTTP_ERROR',
        });

        if (!pageOk) {
          // One re-mint for an OAuth2 credential the API rejected, then give up with AUTH_REQUIRED.
          const rejected = fetched.response.status === 401 || fetched.response.status === 403;
          if (rejected && secretRefreshable && !authRetried && wrapper.request.auth && this.secrets) {
            authRetried = true;
            const refreshed = await this.secrets.resolve(wrapper.request.auth, safeHost(url), { forceRefresh: true });
            if (refreshed.ok && refreshed.header && refreshed.value !== undefined) {
              built.headers[refreshed.header] = refreshed.value;
              secretHeader = refreshed.header;
              secretValues = secretVariants(refreshed.value);
              index -= 1; // retry this page once
              continue;
            }
          }
          pages.push(fetched);
          failed = fetched;
          break;
        }

        pages.push(fetched);

        const json = parseJson(fetched.text, fetched.contentType);
        const safeJson = json === undefined ? undefined : redactDeep(json, secretValues);
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

        if (plan.type === 'link') {
          const candidate = String(next);
          // A page link must stay on the origin the wrapper was written for.
          if (!sameOrigin(candidate, built.url)) {
            more = true;
            break;
          }
          url = candidate;
        } else {
          const pageUrl = new URL(url);
          if (plan.type === 'offset') {
            offset += plan.pageSize;
            pageUrl.searchParams.set(plan.offsetParam ?? 'offset', String(offset));
            if (plan.limitParam) pageUrl.searchParams.set(plan.limitParam, String(plan.pageSize));
          } else if (plan.type === 'cursor') {
            pageUrl.searchParams.set(plan.cursorParam ?? 'cursor', String(next));
          }
          url = pageUrl.toString();
        }
        more = true;
      }
    } catch (err: any) {
      const code =
        err instanceof WrapSecurityError || err instanceof WrapTransportError ? err.code : 'NETWORK_ERROR';
      const retryable = code === 'TIMEOUT' || code === 'NETWORK_ERROR';
      this.audit?.append({
        wrapper: wrapper.id,
        host: safeHost(url),
        method: built.method,
        ok: false,
        code,
      });
      return failure({ id: wrapper.id, name: wrapper.name }, code, err?.message || String(err), request, undefined, retryable);
    }

    const first = pages[0];
    const failedPage = failed ?? first;
    const safeFirstText = redactText(first.text, secretValues);
    const firstJson = rawPages[0];
    const rendered =
      rawPages.length > 1
        ? mergePages(wrapper, rawPages, itemCap, this.transport.maxResultChars)
        : renderWrapped(wrapper, firstJson, safeFirstText, first.contentType, this.transport.maxResultChars);

    const ok = !failed && pages.every((page) => page.response.ok);

    // Opt-in Cortex indexing (`recipe.index === "cortex"`). Best-effort: a Cortex failure
    // never turns a successful upstream call into a failure.
    let indexed: WrapRunResult['indexed'];
    if (ok && wrapper.response?.index === 'cortex' && this.indexDocuments) {
      const documents = documentsToIndex(wrapper, rendered);
      if (documents.length > 0) {
        try {
          const chunks = await this.indexDocuments(documents, {
            wrapperId: wrapper.id,
            wrapperName: wrapper.name,
            url: first.url,
          });
          indexed = { documents: documents.length, chunks };
        } catch (err: any) {
          indexed = { documents: documents.length, chunks: 0, error: err?.message || String(err) };
        }
      }
    }

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
        text: ok && firstJson !== undefined ? undefined : clip(safeFirstText, 1_000),
        json: options.includeRaw ? firstJson : undefined,
      },
      markdown: rendered.markdown,
      records: rendered.records,
      documents: rendered.documents,
      meta: rendered.meta,
      paging: plan.active ? { pages: pages.length, cap: maxPages, more } : undefined,
      indexed,
    };

    if (!ok) {
      const status = failedPage.response.status;
      const message = `HTTP ${status}${failedPage.response.statusText ? ` ${failedPage.response.statusText}` : ''}`;
      const excerpt = clip(redactText(failedPage.text, secretValues), 600);
      const authRejected = status === 401 || status === 403;
      const credential = wrapper.request.auth ? ` "${wrapper.request.auth}"` : '';

      if (authRejected) {
        const hint = `Credential${credential} was rejected (HTTP ${status}). Refresh it in Settings → Wrappers, or raise request_human_intervention.`;
        result.markdown = `**AUTH_REQUIRED** — ${hint}${excerpt ? `\n\n\`\`\`\n${excerpt}\n\`\`\`` : ''}`;
      } else {
        result.markdown = excerpt
          ? `**${message}**\n\n\`\`\`\n${excerpt}\n\`\`\``
          : `**${message}**`;
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
    } else {
      // A live success is the verification signal surfaced as `lastVerified`.
      try {
        this.store.touchVerified(wrapper.id);
      } catch {
        /* verification metadata is best-effort */
      }
    }

    return result;
  }


  private async renderSample(wrapper: WrapWrapper, sample: unknown): Promise<WrapRunResult> {
    const rendered = renderWrapped(
      wrapper,
      sample,
      typeof sample === 'string' ? sample : '',
      'application/json',
      this.transport.maxResultChars,
    );
    return {
      ok: true,
      wrapper: { id: wrapper.id, name: wrapper.name },
      markdown: rendered.markdown,
      records: rendered.records,
      documents: rendered.documents,
      meta: rendered.meta,
    };
  }


  private resolve(
    id: string | undefined,
    wrapper: unknown,
  ): { wrapper?: WrapWrapper; code: string; message: string } {
    return resolveWrapper(this.store, id, wrapper);
  }
}

