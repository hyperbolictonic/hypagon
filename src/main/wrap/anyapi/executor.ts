/**
 * Run wrappers through `anyapi-to-mcp`.
 *
 * The package owns transport: URL policy, DNS checks, redirects, byte caps,
 * credential binding and audit. This module owns the wrapper surface: the
 * stored wrapper, its input schema, the published `WrapRunResult`, recipe
 * rendering, and the "verified" timestamp.
 *
 * Not every wrapper is expressible yet. A wrapper that uses a feature the
 * package cannot reproduce exactly is handed to the legacy executor instead of
 * being approximated; `coreGate` is the single place that decides, and the
 * reason is reported in the integration doc. Falling back per wrapper keeps one
 * process able to serve old and new wrappers without a migration.
 */

import { projectLegacy } from 'anyapi-to-mcp/map';
import type { MapDocument } from 'anyapi-to-mcp/map';
import { executeStored, planOperation } from 'anyapi-to-mcp/runtime';
import type { AuditEvent, BindingTable, DryRunPlan, RunOptions, SecretProvider } from 'anyapi-to-mcp/runtime';

import { validateArgs } from '../input-schema.ts';
import { wrapDryRun, wrapFailure, wrapSuccess } from './result.ts';
import { createSecretAdapter } from './secrets.ts';
import { clampInt, failure, redactDeep, redactText, renderPayload, secretVariants } from '../render.ts';
import { resolveHosts } from '../security.ts';

import type { WrapExecutor } from '../executor.ts';
import type { ExecutorOptions } from '../executor.ts';
import type { WrapFormat, WrapPreview, WrapRunResult, WrapWrapper } from '../types.ts';
import type { SecretStore } from '../secrets.ts';
import type { WrapStore } from '../store.ts';
import { resolveTransportOptions, resolveWrapperInput } from '../executor-options.ts';

import { coreGate, operationOf, optionalPathArguments, withWrapperRequired, type CoreGate } from './gate.ts';
import { pickDeclared, previewFromPlan } from './plan.ts';
import { EphemeralStore } from './payload-store.ts';

export { coreGate, optionalPathArguments, withWrapperRequired, operationOf, type CoreGate } from './gate.ts';

/** When to use: constructing the anyapi executor (store, secrets, limits). */
export interface AnyApiExecutorOptions extends ExecutorOptions {
  /** The core that every wrapper outside the gate is handed to. */
  legacy: WrapExecutor;
  /** Needed for secret bindings; omitted when this build has no secret store. */
  secretSource?: Pick<SecretStore, 'list' | 'resolve'>;
}

/** When to use: running wrappers through the gated anyapi core. */
export class AnyApiWrapExecutor {
  readonly store: WrapStore;
  private readonly legacy: WrapExecutor;
  private readonly fetchImpl: typeof fetch;
  private readonly resolveHost: (hostname: string) => Promise<readonly string[]>;
  private readonly allowPrivateHosts: boolean;
  private readonly allowHttp: boolean;
  private readonly maxRedirects: number;
  private readonly maxResponseBytes: number;
  private readonly maxResultChars: number;
  private readonly defaultTimeoutMs: number;
  private readonly secretSource?: Pick<SecretStore, 'list' | 'resolve'>;
  private readonly audit?: ExecutorOptions['audit'];
  private readonly payloadStore = new EphemeralStore();

  constructor(store: WrapStore, options: AnyApiExecutorOptions) {
    this.store = store;
    this.legacy = options.legacy;
    const transport = resolveTransportOptions(options);
    this.fetchImpl = transport.fetchImpl;
    this.resolveHost = transport.resolveHost ?? resolveHosts;
    this.allowPrivateHosts = transport.allowPrivateHosts;
    this.allowHttp = transport.allowHttp;
    this.maxRedirects = transport.maxRedirects;
    this.maxResponseBytes = transport.maxResponseBytes;
    this.maxResultChars = transport.maxResultChars;
    this.defaultTimeoutMs = transport.defaultTimeoutMs;
    this.secretSource = options.secretSource;
    this.audit = options.audit;
  }

  status(): { wrappers: number; allowPrivateHosts: boolean } {
    return { wrappers: this.store.count(), allowPrivateHosts: this.allowPrivateHosts };
  }

  async run(
    id: string,
    args: unknown,
    options: { format?: WrapFormat; includeRaw?: boolean; maxPages?: number } = {},
  ): Promise<WrapRunResult> {
    const wrapper = this.store.get(id);
    if (!wrapper) return failure({ id, name: id }, 'WRAPPER_NOT_FOUND', `No wrapper named "${id}".`);

    if (!this.usable(wrapper).ok) {
      return this.legacy.run(id, args, options);
    }

    return this.execute(wrapper, args, {
      dryRun: false,
      includeRaw: Boolean(options.includeRaw),
      format: options.format || 'markdown',
    });
  }

  async preview(id: string, args: unknown): Promise<WrapRunResult> {
    const wrapper = this.store.get(id);
    if (!wrapper) return failure({ id, name: id }, 'WRAPPER_NOT_FOUND', `No wrapper named "${id}".`);

    if (!this.usable(wrapper).ok) return this.legacy.preview(id, args);

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

    if (input.sample !== undefined || !this.usable(resolved.wrapper).ok) {
      return this.legacy.test(input);
    }

    return this.execute(resolved.wrapper, input.args, {
      dryRun: input.dryRun !== false,
      includeRaw: Boolean(input.includeRaw),
      format: input.format || 'markdown',
    });
  }

  /** Why this wrapper is not on the core, or `{ ok: true }`. */
  private usable(wrapper: WrapWrapper): CoreGate {
    const gate = coreGate(wrapper);
    if (!gate.ok) return gate;

    const projection = projectLegacy(wrapper);
    if (!projection.map || projection.issues.some((issue) => issue.severity === 'error')) {
      return { ok: false, reason: 'the wrapper does not project to a map' };
    }

    const operation = operationOf(projection.map, wrapper);
    if (!operation) return { ok: false, reason: 'the projected map has no operation' };

    const optionalPath = optionalPathArguments(operation, wrapper);
    if (optionalPath.length > 0) {
      return { ok: false, reason: `optional path argument (${optionalPath.join(', ')})` };
    }

    if (wrapper.request.auth) {
      if (!this.secretSource) return { ok: false, reason: 'no secret store' };
      const adapter = createSecretAdapter(this.secretSource);
      if (adapter.bindings[wrapper.request.auth] === undefined) {
        return { ok: false, reason: `secret "${wrapper.request.auth}" is not representable as an exact-host binding` };
      }
    }

    return { ok: true };
  }

  private async execute(
    wrapper: WrapWrapper,
    argsInput: unknown,
    options: { dryRun: boolean; includeRaw: boolean; format: WrapFormat },
  ): Promise<WrapRunResult> {
    const identity = { id: wrapper.id, name: wrapper.name };

    const validated = validateArgs(wrapper.inputSchema, argsInput);
    if (!validated.ok) {
      return failure(identity, 'INVALID_ARGS', validated.errors.join('; '), undefined, validated.field);
    }

    const projection = projectLegacy(wrapper);
    const map = projection.map;
    const rawOperation = map ? operationOf(map, wrapper) : undefined;
    if (!map || !rawOperation) {
      // `usable()` should have caught this; if projection changed shape under
      // us, never send a request on a dry run.
      if (options.dryRun) return this.legacy.test({ wrapper, args: argsInput, dryRun: true });
      return this.legacy.run(wrapper.id, argsInput, options);
    }

    const operation = withWrapperRequired(rawOperation, wrapper);
    const args = pickDeclared(validated.value, operation);

    const secrets = this.secretSource ? createSecretAdapter(this.secretSource) : undefined;
    const bindings = secrets?.bindings;

    const plan = planOperation(map, operation, args, bindings);
    if (!plan.ok) {
      return wrapFailure(identity, plan.error, { request: undefined });
    }

    const request = previewFromPlan(plan.value);

    if (options.dryRun) return wrapDryRun(identity, plan.value);

    const host = new URL(plan.value.url).hostname;
    const secretValues = await this.secretValues(wrapper, host);

    const runOptions: RunOptions = {
      baseUrl: map.baseUrl,
      fetch: this.fetchImpl,
      policy: {
        allowPrivateHosts: this.allowPrivateHosts,
        allowPlainHttpHosts: this.allowHttp ? [host] : [],
        maxRedirects: this.maxRedirects,
        timeoutMs: clampInt(wrapper.request.timeoutMs ?? this.defaultTimeoutMs, 1_000, 60_000),
        maxBytes: this.maxResponseBytes,
      },
      ...(secrets === undefined
        ? {}
        : { secrets: secrets.provider as SecretProvider, bindings: bindings as BindingTable }),
      ...(this.resolveHost === undefined ? {} : { lookup: this.resolveHost }),
      ...(this.audit === undefined ? {} : { audit: this.auditSink(wrapper) }),
      store: this.payloadStore,
    };

    const started = Date.now();
    const executed = await executeStored(map, operation.id, args, runOptions);
    const durationMs = Date.now() - started;

    if (!executed.ok) {
      return wrapFailure(identity, executed.error, { request, host });
    }

    const executedResult = executed.value;
    const raw = executedResult.payload;
    const text = typeof raw === 'string' ? redactText(raw, secretValues) : '';
    const json = typeof raw === 'string' ? undefined : redactDeep(raw, secretValues);
    const rendered = renderPayload(wrapper, json, text, '', { maxChars: this.maxResultChars });

    const result = wrapSuccess({
      wrapper: identity,
      result: { status: executedResult.status },
      request,
      rendered,
      durationMs,
      bytes: executedResult.sourceBytes,
    });

    if (options.includeRaw) result.response = { ...(result.response ?? { bytes: executedResult.sourceBytes }), json };

    try {
      this.store.touchVerified(wrapper.id);
    } catch {
      /* verification metadata is best-effort */
    }

    return result;
  }

  /** The credential, so a response that echoes it can be redacted. */
  private async secretValues(wrapper: WrapWrapper, host: string): Promise<string[]> {
    if (!wrapper.request.auth || !this.secretSource) return [];
    const resolved = await this.secretSource.resolve(wrapper.request.auth, host);
    return resolved.ok && resolved.value ? secretVariants(resolved.value) : [];
  }

  private auditSink(wrapper: WrapWrapper): { record(event: AuditEvent): void } {
    return {
      record: (event: AuditEvent) => {
        const ok = event.status >= 200 && event.status < 300;
        this.audit?.append({
          wrapper: wrapper.id,
          host: event.host,
          method: event.method,
          status: event.status,
          ok,
          bytes: event.bytes,
          durationMs: event.durationMs,
          code: ok ? undefined : 'HTTP_ERROR',
        });
      },
    };
  }

  private resolve(id: string | undefined, wrapper: unknown): { wrapper?: WrapWrapper; code: string; message: string } {
    return resolveWrapperInput(this.store, id, wrapper);
  }
}
