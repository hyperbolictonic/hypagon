/**
 * The outbound request: redirects, the host policy, timeouts and the byte cap.
 *
 * Redirects are followed by hand so each hop is re-checked by `assertSafeUrl` and so an
 * injected credential is never carried across an origin boundary. The body is read with a
 * hard byte cap: a hostile or huge response is truncated, not buffered.
 *
 * When to use: `execute` for every page fetch. Policy values come from the executor options.
 */
import { assertSafeUrl, WrapSecurityError } from './security.ts';
import { clampInt } from './render.ts';
import type { buildRequest } from './interpolate.ts';
import type { WrapWrapper } from './types.ts';
import type { FetchedResponse } from './execution-types.ts';

/** When to use: turning a transport failure into a structured wrapper error with a code. */
export class WrapTransportError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'WrapTransportError';
    this.code = code;
  }
}

/** When to use: the executor's resolved transport limits, passed to each fetch. */
export interface ResponsePolicy {
  fetchImpl: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  allowPrivateHosts: boolean;
  allowHttp: boolean;
  maxRedirects: number;
  maxResponseBytes: number;
  defaultTimeoutMs: number;
}

/** When to use: fetching one page under the policy — redirects, timeout, credential boundary. */
export async function fetchWithPolicy(
  policy: ResponsePolicy,
  wrapper: WrapWrapper,
  built: ReturnType<typeof buildRequest>,
  secretHeader?: string,
): Promise<FetchedResponse> {
  const timeoutMs = clampInt(wrapper.request.timeoutMs ?? policy.defaultTimeoutMs, 1_000, 60_000);
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
        allowPrivateHosts: policy.allowPrivateHosts,
        allowHttp: policy.allowHttp,
        resolveHost: policy.resolveHost,
      });

      const init: RequestInit = {
        method,
        headers,
        redirect: 'manual',
        signal: controller.signal,
      };
      if (body !== undefined) init.body = body;

      const response = await policy.fetchImpl(safe.toString(), init);
      const location = response.headers.get('location');

      if (isRedirect(response.status) && location) {
        if (redirects >= policy.maxRedirects) {
          await response.body?.cancel();
          throw new WrapTransportError('TOO_MANY_REDIRECTS', `Exceeded ${policy.maxRedirects} redirects.`);
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

      return await readResponse(policy, response, safe.toString(), started);
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

/** When to use: reading one response body under the byte cap. */
export async function readResponse(
  policy: ResponsePolicy,
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
      if (next > policy.maxResponseBytes) {
        const remaining = policy.maxResponseBytes - bytes;
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

/** When to use: deciding whether a status is a redirect we follow by hand. */
export function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

/** When to use: dropping a credential header case-insensitively. */
export function deleteHeader(headers: Record<string, string>, name: string): void {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name.toLowerCase()) delete headers[key];
  }
}

/** When to use: refusing to follow a page link off the wrapper's origin. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
