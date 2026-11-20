/**
 * Transport limits shared by both executor cores.
 *
 * Why this is one module: the defaults are a policy — redirect cap, response
 * byte cap, timeout, private-host/HTTP allowances. Two copies drift silently:
 * the anyapi core could keep accepting 5 MB while the legacy core moved to
 * 10 MB, and the same wrapper would behave differently depending on
 * `HB_WRAP_CORE`. The clamping lives here once; each core adds only its own
 * knobs (`maxPages`, `indexDocuments`, …).
 */
import { clampInt } from './render.ts';

/** Options every executor core accepts for transport safety. */
export interface WrapTransportOptions {
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  allowPrivateHosts?: boolean;
  allowHttp?: boolean;
  maxRedirects?: number;
  maxResponseBytes?: number;
  maxResultChars?: number;
  defaultTimeoutMs?: number;
}

/** Resolved transport limits: every value present, environment defaults applied. */
export interface WrapLimits {
  fetchImpl: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  allowPrivateHosts: boolean;
  allowHttp: boolean;
  maxRedirects: number;
  maxResponseBytes: number;
  maxResultChars: number;
  defaultTimeoutMs: number;
}

/**
 * When to use: constructing an executor core. Resolves the shared transport
 * limits, including the `HB_WRAP_*` / `KUANG_WRAP_*` environment defaults, so
 * both cores enforce the same policy.
 */
export function resolveWrapLimits(options: WrapTransportOptions): WrapLimits {
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
