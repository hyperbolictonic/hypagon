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
import type { MapDocument, Operation } from 'anyapi-to-mcp/map';
import { bytesOf, handleFor } from 'anyapi-to-mcp/store';
import type { PayloadStore, PutOptions, StoredPayload, StoreError } from 'anyapi-to-mcp/store';
import { executeStored, planOperation } from 'anyapi-to-mcp/runtime';
import type { AuditEvent, BindingTable, DryRunPlan, RunOptions, SecretProvider } from 'anyapi-to-mcp/runtime';
import type { Result } from 'anyapi-to-mcp';

import { validateArgs } from '../input-schema.ts';
import { wrapDryRun, wrapFailure, wrapSuccess } from './result.ts';
import { createSecretAdapter } from './secrets.ts';
import { clampInt, failure, previewUrl, redactDeep, redactText, renderPayload, secretVariants } from '../render.ts';
import { resolveHosts } from '../security.ts';
import { resolveWrapLimits, type WrapLimits } from '../limits.ts';
import type { ExecuteOptions } from '../execute-pipeline.ts';
import { bindRunCore, WrapRunSurface } from '../run-surface.ts';
import type { WrapCore } from '../core.ts';
import type { WrapExecutor } from '../executor.ts';
import type { ExecutorOptions } from '../executor.ts';
import type { WrapPreview, WrapRunResult, WrapWrapper } from '../types.ts';
import type { SecretStore } from '../secrets.ts';
import type { WrapStore } from '../store.ts';

export type CoreGate = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Features the core cannot reproduce yet, and therefore stay on the legacy executor. */
export function coreGate(wrapper: WrapWrapper): CoreGate {
  const request = wrapper.request;

  if (request.methods && request.methods.length > 1) {
    return { ok: false, reason: 'wrappers that accept more than one method' };
  }

  const bodyFormat = request.bodyFormat ?? 'json';
  if (request.body !== undefined && bodyFormat !== 'json') {
    return { ok: false, reason: `bodyFormat "${bodyFormat}"` };
  }

  const pagination = wrapper.response?.pagination;
  if (pagination && (pagination.type ?? 'none') !== 'none') {
    return { ok: false, reason: 'recipe pagination' };
  }

  if (wrapper.response?.index === 'cortex') {
    return { ok: false, reason: 'Cortex indexing' };
  }

  if (request.url.includes('|raw')) {
    return { ok: false, reason: 'raw path segments ({{name|raw}})' };
  }

  // A templated header the core cannot fill would be sent literally, while the
  // legacy executor drops it.
  const required = new Set(wrapper.inputSchema?.required ?? []);
  for (const value of Object.values(request.headers ?? {})) {
    for (const match of value.matchAll(/\{\{([^}|]+)(?:\|[^}]*)?\}\}/g)) {
      const name = match[1]!;
      if (!required.has(name)) return { ok: false, reason: `optional header argument "${name}"` };
    }
  }

  if ((request.method === 'GET' || request.method === 'HEAD') && request.body !== undefined) {
    return { ok: false, reason: 'a body on a GET/HEAD request' };
  }

  // Projection drops an array or object query value, so those wrappers keep the
  // legacy executor rather than silently losing a parameter.
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (typeof value === 'object' && value !== null) {
      return { ok: false, reason: `query value "${key}" is not scalar` };
    }
  }

  // The core's input contract is scalar only. An array or object argument would
  // be coerced to a string there, so the wrapper stays on the legacy executor.
  for (const [name, property] of Object.entries(wrapper.inputSchema?.properties ?? {})) {
    const type = Array.isArray(property.type) ? property.type.join('|') : property.type;
    if (type !== undefined && type !== 'string' && type !== 'integer' && type !== 'number' && type !== 'boolean') {
      return { ok: false, reason: `input property "${name}" is ${type}` };
    }
  }

  return { ok: true };
}

/** Map a projected operation's required list back to the wrapper's own schema. */
function withWrapperRequired(operation: Operation, wrapper: WrapWrapper): Operation {
  if (!operation.input) return operation;
  return { ...operation, input: { ...operation.input, required: wrapper.inputSchema?.required ?? [] } };
}

/** Placeholders in a path the wrapper does not declare as required. */
function optionalPathArguments(operation: Operation, wrapper: WrapWrapper): string[] {
  const required = new Set(wrapper.inputSchema?.required ?? []);
  const names = [...operation.request.path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!);
  return names.filter((name) => !required.has(name));
}

export interface AnyApiExecutorOptions extends ExecutorOptions {
  /** The core that every wrapper outside the gate is handed to. */
  legacy: WrapExecutor;
  /** Needed for secret bindings; omitted when this build has no secret store. */
  secretSource?: Pick<SecretStore, 'list' | 'resolve'>;
}

export interface AnyApiWrapExecutor extends WrapCore {}

export class AnyApiWrapExecutor {
  readonly store: WrapStore;
  private readonly legacy: WrapExecutor;
  private readonly transport: WrapLimits;
  private readonly secretSource?: Pick<SecretStore, 'list' | 'resolve'>;
  private readonly audit?: ExecutorOptions['audit'];
  private readonly payloadStore = new EphemeralStore();

  constructor(store: WrapStore, options: AnyApiExecutorOptions) {
    this.store = store;
    this.legacy = options.legacy;
    this.transport = resolveWrapLimits(options);
    this.secretSource = options.secretSource;
    this.audit = options.audit;
    const surface = new WrapRunSurface({
      store,
      limits: this.transport,
      gate: (wrapper) => this.usable(wrapper),
      execute: (wrapper, args, runOptions) => this.execute(wrapper, args, runOptions),
      fallback: {
        run: (id, args, runOptions) => this.legacy.run(id, args, runOptions),
        preview: (id, args) => this.legacy.preview(id, args),
        test: (input) => this.legacy.test(input),
      },
    });
    Object.assign(this, bindRunCore(surface));
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
    options: ExecuteOptions,
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

    return await this.send({
      wrapper,
      identity,
      map,
      operation,
      args,
      plan: plan.value,
      request,
      secrets,
      options,
    });
  }

  /**
   * Send a planned run: build the transport options, execute, redact any echoed credential,
   * render the payload and mark the wrapper verified.
   */
  private async send(input: {
    wrapper: WrapWrapper;
    identity: { id: string; name: string };
    map: MapDocument;
    operation: Operation;
    args: Record<string, unknown>;
    plan: DryRunPlan;
    request: WrapPreview;
    secrets: ReturnType<typeof createSecretAdapter> | undefined;
    options: ExecuteOptions;
  }): Promise<WrapRunResult> {
    const { wrapper, identity, map, operation, args, plan, request, secrets, options } = input;

    const host = new URL(plan.url).hostname;
    const secretValues = await this.secretValues(wrapper, host);

    const runOptions: RunOptions = {
      baseUrl: map.baseUrl,
      fetch: this.transport.fetchImpl,
      policy: {
        allowPrivateHosts: this.transport.allowPrivateHosts,
        allowPlainHttpHosts: this.transport.allowHttp ? [host] : [],
        maxRedirects: this.transport.maxRedirects,
        timeoutMs: clampInt(wrapper.request.timeoutMs ?? this.transport.defaultTimeoutMs, 1_000, 60_000),
        maxBytes: this.transport.maxResponseBytes,
      },
      ...(secrets === undefined
        ? {}
        : { secrets: secrets.provider as SecretProvider, bindings: secrets.bindings as BindingTable }),
      lookup: this.transport.resolveHost ?? resolveHosts,
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
    const rendered = renderPayload(wrapper, json, text, '', { maxChars: this.transport.maxResultChars });

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

}

/**
 * A payload store that keeps nothing.
 *
 * The core stores every response behind a handle, but the wrapper surface never
 * exposes handles: `executeStored` also returns the payload, and the result is
 * rendered immediately. Retaining the payload would keep every response of the
 * process in memory for a day, so this store hands back the same deterministic
 * handle and drops the body.
 */
class EphemeralStore implements PayloadStore {
  async put(payload: unknown, options: PutOptions = {}): Promise<StoredPayload> {
    return {
      handle: handleFor(payload),
      payload,
      meta: {
        bytes: bytesOf(payload),
        createdAt: new Date().toISOString(),
        fetches: 1,
        ...(options.operation === undefined ? {} : { operation: options.operation }),
        ...(options.view === undefined || options.view === null ? {} : { view: options.view }),
        ...(options.url === undefined ? {} : { url: options.url }),
        ...(options.host === undefined ? {} : { host: options.host }),
        ...(options.status === undefined ? {} : { status: options.status }),
        ...(options.kind === undefined ? {} : { kind: options.kind }),
      },
    };
  }

  async get(handle: string): Promise<Result<StoredPayload, StoreError>> {
    return { ok: false, error: { code: 'handle_not_found', message: `this run did not retain ${handle}` } };
  }

  async prune(): Promise<number> {
    return 0;
  }
}

function operationOf(map: MapDocument, wrapper: WrapWrapper): Operation | undefined {
  return map.operations.find((operation) => operation.id === wrapper.id) ?? map.operations[0];
}

function pickDeclared(value: Record<string, unknown>, operation: Operation): Record<string, unknown> {
  const properties = operation.input?.properties;
  if (!properties) return {};
  const declared = new Set(Object.keys(properties));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (declared.has(key)) out[key] = entry;
  }
  return out;
}

/** A preview from the core's plan: header names only, every value redacted. */
function previewFromPlan(plan: DryRunPlan): WrapPreview {
  const headers: Record<string, string> = {};
  for (const name of plan.headers) headers[name] = '<redacted>';
  return {
    method: plan.method as WrapPreview['method'],
    url: previewUrl(plan.url, plan.query),
    headers,
    ...(plan.body === undefined ? {} : { body: plan.body }),
  };
}
