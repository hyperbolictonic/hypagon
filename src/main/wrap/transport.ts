/**
 * HTTP transport for the REST executor.
 *
 * URL policy, redirects, byte caps and timeouts live here so `WrapExecutor`
 * stays an orchestrator and the policy can be tested without a wrapper store.
 */
import type { buildRequest } from './interpolate.ts';
import { clampInt } from './render.ts';
import { assertSafeUrl, WrapSecurityError } from './security.ts';
import type { WrapWrapper } from './types.ts';

/** The transport fields both executor cores resolve from `WrapLimits`. */
export interface TransportContext {
  fetchImpl: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  allowPrivateHosts: boolean;
  allowHttp: boolean;
  maxRedirects: number;
  maxResponseBytes: number;
  defaultTimeoutMs: number;
}

/** One fetched page after URL policy, redirects and the byte cap. */
export interface FetchedResponse {
  response: Response;
  url: string;
  text: string;
  bytes: number;
  truncated: boolean;
  durationMs: number;
  contentType: string;
}

/** A transport-policy failure with a stable code callers can match on. */
export class WrapTransportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WrapTransportError';
    this.code = code;
  }
}

/** Fetch one page while enforcing URL policy, redirects, timeout and the byte cap. */
export async function fetchWithPolicy(
  transport: TransportContext,
  wrapper: WrapWrapper,
  built: ReturnType<typeof buildRequest>,
  secretHeader?: string,
): Promise<FetchedResponse> {
  const timeoutMs = clampInt(wrapper.request.timeoutMs ?? transport.defaultTimeoutMs, 1_000, 60_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let url = built.url;
  let method = built.method;
  let body = built.body;
  let authHeader = secretHeader;
  const headers = { ...built.headers };
  const started = Date.now();

  try {
    for (let redirects = 0; ; redirects++) {
      const safe = await assertSafeUrl(url, {
        allowPrivateHosts: transport.allowPrivateHosts,
        allowHttp: transport.allowHttp,
        resolveHost: transport.resolveHost,
      });

      const init: RequestInit = {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      };
      if (body !== undefined) init.body = body;

      const response = await transport.fetchImpl(safe.toString(), init);
      const location = response.headers.get('location');

      if (isRedirect(response.status) && location) {
        if (redirects >= transport.maxRedirects) {
          await response.body?.cancel();
          throw new WrapTransportError('TOO_MANY_REDIRECTS', `Exceeded ${transport.maxRedirects} redirects.`);
        }

        const next = new URL(location, safe).toString();
        await response.body?.cancel();

        // Never carry an injected credential across an origin boundary.
        if (authHeader && new URL(next).origin !== safe.origin) {
          deleteHeader(headers, authHeader);
          authHeader = undefined;
        }

        if (response.status === 303 || ((response.status === 301 || response.status === 302) && method !== 'GET' && method !== 'HEAD')) {
          method = 'GET';
          body = undefined;
          delete headers['content-type'];
          delete headers['Content-Type'];
          delete headers['content-length'];
          delete headers['Content-Length'];
        }

        url = next;
        continue;
      }

      return await readResponse(transport, response, safe.toString(), started);
    }
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
      throw new WrapTransportError('TIMEOUT', `Request timed out after ${timeoutMs} ms.`);
    }
    if (err instanceof WrapSecurityError || err instanceof WrapTransportError) throw err;
    throw new WrapTransportError('NETWORK_ERROR', err?.message || String(err));
  } finally {
    clearTimeout(timer);
  }
}

async function readResponse(
  transport: TransportContext,
  response: Response,
  url: string,
  started: number,
): Promise<FetchedResponse> {
  const contentType = response.headers.get('content-type') || '';
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const next = bytes + value.byteLength;
      if (next > transport.maxResponseBytes) {
        const remaining = transport.maxResponseBytes - bytes;
        if (remaining > 0) {
          chunks.push(value.subarray(0, remaining));
          bytes += remaining;
        }
        truncated = true;
        await reader.cancel();
        break;
      }

      chunks.push(value);
      bytes = next;
    }
  }

  const text = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  return {
    response,
    url,
    text,
    bytes,
    truncated,
    durationMs: Date.now() - started,
    contentType,
  };
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function deleteHeader(headers: Record<string, string>, name: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
}
