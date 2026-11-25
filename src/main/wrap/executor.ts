/**
 * The REST executor.
 *
 * It validates the agent's arguments, builds the request deterministically,
 * applies the outbound policy, fetches, and renders the response through the
 * recipe. It never sees a secret in this slice; the secret store arrives in S2
 * and will keep values in the main process, not here.
 */

import { resolveWrapLimits, type WrapLimits, type WrapTransportOptions } from './limits.ts';
import { bindRunCore, WrapRunSurface } from './run-surface.ts';
import type { WrapCore } from './core.ts';
import { clampInt } from './render.ts';
import { renderWrapped } from './rendering.ts';
import { executeWrapper, type ExecuteOptions } from './execute-pipeline.ts';
import type { WrapIndexContext, WrapIndexDocument } from './pagination.ts';
import type { WrapRunResult, WrapWrapper } from './types.ts';
import type { WrapStore } from './store.ts';
import type { SecretStore } from './secrets.ts';
import type { WrapAuditLog } from './audit.ts';

export type { WrapIndexContext, WrapIndexDocument };
export { WrapTransportError } from './transport.ts';

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


/** Overall item cap when a recipe does not declare `limits.maxItems` (mirrors the renderer). */
const DEFAULT_MAX_ITEMS = 50;

export interface WrapExecutor extends WrapCore {}

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
    const surface = new WrapRunSurface({
      store,
      limits: this.transport,
      execute: (wrapper, args, runOptions) => this.execute(wrapper, args, runOptions),
      renderSample: (wrapper, sample) => this.renderSample(wrapper, sample),
    });
    Object.assign(this, bindRunCore(surface));
  }

  private async execute(wrapper: WrapWrapper, argsInput: unknown, options: ExecuteOptions): Promise<WrapRunResult> {
    return executeWrapper(
      {
        transport: this.transport,
        maxPages: this.maxPages,
        defaultMaxItems: this.defaultMaxItems,
        secrets: this.secrets,
        audit: this.audit,
        indexDocuments: this.indexDocuments,
        touchVerified: (id) => this.store.touchVerified(id),
      },
      wrapper,
      argsInput,
      options,
    );
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

}

