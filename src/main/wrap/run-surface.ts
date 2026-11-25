/**
 * The wrapper run surface shared by both executors.
 *
 * `WrapExecutor` (legacy) and `AnyApiWrapExecutor` expose the same four
 * operations — status, run, preview, test — with the same not-found and
 * invalid-args contracts. The difference is what happens once a wrapper is
 * resolved: the legacy executor always runs it, the anyapi executor gates it and
 * hands unsupported wrappers to the legacy fallback. Composition keeps that
 * difference in one small gate hook instead of two diverging copies of the
 * surface.
 */
import type { WrapCore, WrapRunOptions, WrapTestInput } from './core.ts';
import type { ExecuteOptions } from './execute-pipeline.ts';
import type { WrapLimits } from './limits.ts';
import { failure } from './render.ts';
import { resolveWrapper } from './resolve.ts';
import type { WrapStore } from './store.ts';
import type { WrapRunResult, WrapWrapper } from './types.ts';

/** When to use: building an executor — where a resolved wrapper actually runs. */
export interface WrapRunSurfaceDeps {
  store: WrapStore;
  limits: WrapLimits;
  /** The wrappers this executor can run; a rejection hands the call to `fallback`. */
  gate?(wrapper: WrapWrapper): { ok: true } | { ok: false; reason: string };
  execute(wrapper: WrapWrapper, args: unknown, options: ExecuteOptions): Promise<WrapRunResult>;
  /** Render a sample payload; omitted when samples go through `fallback.test`. */
  renderSample?(wrapper: WrapWrapper, sample: unknown): Promise<WrapRunResult>;
  /** Where calls go when the gate rejects, or when only the fallback can serve a sample. */
  fallback?: {
    run(id: string, args: unknown, options: WrapRunOptions): Promise<WrapRunResult>;
    preview(id: string, args: unknown): Promise<WrapRunResult>;
    test(input: WrapTestInput): Promise<WrapRunResult>;
  };
}

/** The four bound operations an executor publishes; see `bindRunCore`. */
export interface WrapCoreMethods {
  status: WrapCore['status'];
  run: WrapCore['run'];
  preview: WrapCore['preview'];
  test: WrapCore['test'];
}

/** The not-found/status/test contract both wrapper executors publish. */
export class WrapRunSurface {
  readonly status = (): { wrappers: number; allowPrivateHosts: boolean } => {
    return { wrappers: this.deps.store.count(), allowPrivateHosts: this.deps.limits.allowPrivateHosts };
  };

  readonly run = (id: string, args: unknown, options: WrapRunOptions = {}): Promise<WrapRunResult> => {
    return this.dispatch(
      id,
      args,
      {
        dryRun: false,
        includeRaw: Boolean(options.includeRaw),
        format: options.format || 'markdown',
        maxPages: options.maxPages,
      },
      (fallback) => fallback.run(id, args, options),
    );
  };

  readonly preview = (id: string, args: unknown): Promise<WrapRunResult> => {
    return this.dispatch(
      id,
      args,
      { dryRun: true, includeRaw: false, format: 'markdown' },
      (fallback) => fallback.preview(id, args),
    );
  };

  readonly test = async (input: WrapTestInput): Promise<WrapRunResult> => {
    const resolved = this.resolve(input.id, input.wrapper);
    if (!resolved.wrapper) {
      return failure({ id: input.id || '(unsaved)', name: input.id || '(unsaved)' }, resolved.code, resolved.message);
    }

    if (this.deps.renderSample && input.sample !== undefined) {
      return this.deps.renderSample(resolved.wrapper, input.sample);
    }

    const fallback = this.deps.fallback;
    if (fallback && (input.sample !== undefined || !this.runsHere(resolved.wrapper))) {
      return fallback.test(input);
    }

    return this.deps.execute(resolved.wrapper, input.args, {
      dryRun: input.dryRun !== false,
      includeRaw: Boolean(input.includeRaw),
      format: input.format || 'markdown',
      maxPages: input.maxPages,
    });
  };

  private readonly deps: WrapRunSurfaceDeps;

  constructor(deps: WrapRunSurfaceDeps) {
    this.deps = deps;
  }

  /** The shared run/preview path: not-found, gate/fallback, then the executor. */
  private async dispatch(
    id: string,
    args: unknown,
    options: ExecuteOptions,
    viaFallback: (fallback: NonNullable<WrapRunSurfaceDeps['fallback']>) => Promise<WrapRunResult>,
  ): Promise<WrapRunResult> {
    const stored = this.stored(id);
    if ('failure' in stored) return stored.failure;

    const fallback = this.deps.fallback;
    if (fallback && !this.runsHere(stored.wrapper)) return viaFallback(fallback);

    return this.deps.execute(stored.wrapper, args, options);
  }

  /** The stored wrapper, or the shared not-found result. */
  private stored(id: string): { wrapper: WrapWrapper } | { failure: WrapRunResult } {
    const wrapper = this.deps.store.get(id);
    if (!wrapper) return { failure: failure({ id, name: id }, 'WRAPPER_NOT_FOUND', `No wrapper named "${id}".`) };
    return { wrapper };
  }

  private runsHere(wrapper: WrapWrapper): boolean {
    return this.deps.gate ? this.deps.gate(wrapper).ok : true;
  }

  private resolve(
    id: string | undefined,
    wrapper: unknown,
  ): { wrapper?: WrapWrapper; code: string; message: string } {
    return resolveWrapper(this.deps.store, id, wrapper);
  }
}

/**
 * The surface's bound operations, ready to copy onto an executor instance.
 *
 * The executors publish the same four methods; binding them from the surface
 * keeps one implementation instead of a copy per executor.
 */
export function bindRunCore(surface: WrapRunSurface): WrapCoreMethods {
  return {
    status: surface.status,
    run: surface.run,
    preview: surface.preview,
    test: surface.test,
  };
}
