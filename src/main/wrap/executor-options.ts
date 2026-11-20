/**
 * Transport options and wrapper resolution shared by the two executors.
 *
 * The legacy executor and the anyapi executor must interpret the same env flags,
 * defaults and caps identically, or a wrapper would behave differently depending on
 * which path served it. They also resolve `{id}` / `{wrapper}` the same way.
 *
 * When to use: constructing either executor, or resolving a test input to a wrapper.
 * Execution itself lives in executor.ts and anyapi/executor.ts.
 */

import { clampInt } from './render.ts';
import { validateWrapper } from './validate-wrapper.ts';
import type { WrapStore } from './store.ts';
import type { WrapWrapper } from './types.ts';

/** When to use: the transport-related subset of an executor's options. */
export interface TransportOptionInput {
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  allowPrivateHosts?: boolean;
  allowHttp?: boolean;
  maxRedirects?: number;
  maxResponseBytes?: number;
  maxResultChars?: number;
  defaultTimeoutMs?: number;
}

/** When to use: the clamped, env-aware transport settings both executors copy into fields. */
export interface TransportOptions {
  fetchImpl: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  allowPrivateHosts: boolean;
  allowHttp: boolean;
  maxRedirects: number;
  maxResponseBytes: number;
  maxResultChars: number;
  defaultTimeoutMs: number;
}

/** When to use: resolving env overrides and clamping the shared transport limits. */
export function resolveTransportOptions(options: TransportOptionInput = {}): TransportOptions {
  return {
    fetchImpl: options.fetchImpl || globalThis.fetch.bind(globalThis),
    resolveHost: options.resolveHost,
    allowPrivateHosts: options.allowPrivateHosts ?? (process.env.HB_WRAP_ALLOW_PRIVATE ?? process.env.KUANG_WRAP_ALLOW_PRIVATE) === '1',
    allowHttp: options.allowHttp ?? (process.env.HB_WRAP_ALLOW_HTTP ?? process.env.KUANG_WRAP_ALLOW_HTTP) === '1',
    maxRedirects: clampInt(options.maxRedirects ?? 5, 0, 10),
    maxResponseBytes: clampInt(options.maxResponseBytes ?? 5_000_000, 1_000, 10_000_000),
    maxResultChars: clampInt(options.maxResultChars ?? 50_000, 1_000, 200_000),
    defaultTimeoutMs: clampInt(options.defaultTimeoutMs ?? 15_000, 1_000, 60_000),
  };
}

/**
 * When to use: turning a test/preview input into a validated wrapper — an explicit
 * wrapper wins over a stored id, and every failure carries a code and message.
 */
export function resolveWrapperInput(
  store: WrapStore,
  id: string | undefined,
  wrapper: unknown,
): { wrapper?: WrapWrapper; code: string; message: string } {
  if (wrapper !== undefined) {
    const validation = validateWrapper(wrapper);
    if (!validation.ok || !validation.wrapper) {
      return { code: 'INVALID_WRAPPER', message: validation.errors.join('; ') };
    }
    return { wrapper: validation.wrapper, code: '', message: '' };
  }

  if (!id) return { code: 'WRAPPER_REQUIRED', message: 'Provide either id or wrapper.' };
  const stored = store.get(id);
  if (!stored) return { code: 'WRAPPER_NOT_FOUND', message: `No wrapper named "${id}".` };
  return { wrapper: stored, code: '', message: '' };
}
