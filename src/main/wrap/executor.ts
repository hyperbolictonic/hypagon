/**
 * The REST executor.
 *
 * It validates the agent's arguments, builds the request deterministically, applies the
 * outbound policy, fetches, and renders the response through the recipe. It never sees a
 * secret value: the store resolves the credential per request and this class only carries
 * the resulting header.
 *
 * The run pipeline lives in `execute.ts` (prepare → fetch pages → compose), paging rules in
 * `pagination.ts`, and the outbound request in `response.ts`. This class owns the options and
 * the public API.
 */

import { clampInt, failure, renderPayload } from './render.ts';
import { resolveTransportOptions, resolveWrapperInput } from './executor-options.ts';
import type { TransportOptionInput } from './executor-options.ts';
import { executeWrapper } from './execute.ts';
import type { ExecuteDeps } from './execute.ts';
import type { ResponsePolicy } from './response.ts';
import type { ExecuteOptions, WrapIndexContext, WrapIndexDocument } from './execution-types.ts';
import { DEFAULT_MAX_ITEMS } from './execution-types.ts';
import type { WrapFormat, WrapRunResult, WrapWrapper } from './types.ts';
import type { WrapStore } from './store.ts';
import type { SecretStore } from './secrets.ts';
import type { WrapAuditLog } from './audit.ts';

export type { WrapIndexContext, WrapIndexDocument } from './execution-types.ts';
export { WrapTransportError } from './response.ts';

/** When to use: constructing a WrapExecutor (store, secrets, fetch, limits). */
export interface ExecutorOptions extends TransportOptionInput {
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

/** When to use: running saved wrappers: build the request, gate the host, fetch, render. */
export class WrapExecutor {
  readonly store: WrapStore;
  private readonly policy: ResponsePolicy;
  private readonly maxPages: number;
  private readonly defaultMaxItems: number;
  private readonly maxResultChars: number;
  private readonly indexDocuments?: (documents: WrapIndexDocument[], context: WrapIndexContext) => Promise<number>;
  private readonly secrets?: Pick<SecretStore, 'resolve'>;
  private readonly audit?: Pick<WrapAuditLog, 'append'>;

  constructor(store: WrapStore, options: ExecutorOptions = {}) {
    this.store = store;
    const transport = resolveTransportOptions(options);
    this.policy = {
      fetchImpl: transport.fetchImpl,
      ...(transport.resolveHost === undefined ? {} : { resolveHost: transport.resolveHost }),
      allowPrivateHosts: transport.allowPrivateHosts,
      allowHttp: transport.allowHttp,
      maxRedirects: transport.maxRedirects,
      maxResponseBytes: transport.maxResponseBytes,
      defaultTimeoutMs: transport.defaultTimeoutMs,
    };
    this.maxResultChars = transport.maxResultChars;
    this.maxPages = clampInt(options.maxPages ?? 10, 1, 25);
    this.defaultMaxItems = clampInt(options.maxItems ?? DEFAULT_MAX_ITEMS, 1, 5_000);
    this.indexDocuments = options.indexDocuments;
    this.secrets = options.secrets;
    this.audit = options.audit;
  }

  status(): { wrappers: number; allowPrivateHosts: boolean } {
    return { wrappers: this.store.count(), allowPrivateHosts: this.policy.allowPrivateHosts };
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
    if (!resolved.wrapper) {
      return failure({ id: input.id || '(unsaved)', name: input.id || '(unsaved)' }, resolved.code, resolved.message);
    }

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
    const deps: ExecuteDeps = {
      store: this.store,
      ...(this.secrets === undefined ? {} : { secrets: this.secrets }),
      ...(this.audit === undefined ? {} : { audit: this.audit }),
      ...(this.indexDocuments === undefined ? {} : { indexDocuments: this.indexDocuments }),
      policy: this.policy,
      maxPages: this.maxPages,
      defaultMaxItems: this.defaultMaxItems,
      maxResultChars: this.maxResultChars,
      render: (target, json, text, contentType, maxItems) => this.render(target, json, text, contentType, maxItems),
    };
    return executeWrapper(deps, wrapper, argsInput, options);
  }

  private async renderSample(wrapper: WrapWrapper, sample: unknown): Promise<WrapRunResult> {
    const rendered = this.render(wrapper, sample, typeof sample === 'string' ? sample : '', 'application/json');
    return {
      ok: true,
      wrapper: { id: wrapper.id, name: wrapper.name },
      markdown: rendered.markdown,
      records: rendered.records,
      documents: rendered.documents,
      meta: rendered.meta,
    };
  }

  private render(
    wrapper: WrapWrapper,
    json: unknown,
    text: string,
    contentType: string,
    maxItems?: number,
  ): ReturnType<typeof renderPayload> {
    return renderPayload(wrapper, json, text, contentType, { maxChars: this.maxResultChars, maxItems });
  }

  private resolve(id: string | undefined, wrapper: unknown): { wrapper?: WrapWrapper; code: string; message: string } {
    return resolveWrapperInput(this.store, id, wrapper);
  }
}
