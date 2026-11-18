/**
 * Wrapper request normalisation: one place where a stored request template is
 * trusted.
 *
 * Validation is a safety boundary, not cosmetics: credentials may only travel as a
 * named secret (never a query string or a header the wrapper chooses), bodies are
 * limited to methods that carry them, and the URL may template the path/query but
 * never the host.
 *
 * When to use: validating `request` when a wrapper is saved or run. Wrapper
 * document/response validation lives in validate-wrapper.ts.
 */

import type { WrapMethod, WrapRequest } from './types.ts';
// Shared structural predicate; see plain-object.ts.
import { isPlainObject } from './plain-object.js';
import { HTTP_METHODS, IDENTIFIER_PATTERN } from './identifiers.js';

const BODY_FORMATS = new Set(['json', 'form', 'text']);
const CREDENTIAL_QUERY_KEYS = new Set([
  'api_key',
  'apikey',
  'auth',
  'access_token',
  'refresh_token',
  'token',
  'secret',
  'password',
]);
const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'connection',
  'transfer-encoding',
  'upgrade',
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'x-auth-token',
  'x-access-token',
]);

/** When to use: normalising `request.method`/`request.methods` into one primary plus the full set. */
function normalizeMethods(
  source: Record<string, unknown>,
  errors: string[],
): { primary: WrapMethod; methods: WrapMethod[] } | null {
  const raw: unknown[] = [];
  if (Array.isArray(source.method)) raw.push(...source.method);
  else if (source.method !== undefined) raw.push(source.method);
  if (Array.isArray(source.methods)) raw.push(...source.methods);
  else if (source.methods !== undefined) errors.push('request.methods must be an array of HTTP methods');
  if (raw.length === 0) raw.push('GET');

  const methods: WrapMethod[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      errors.push('request.methods entries must be strings');
      continue;
    }
    const method = item.trim().toUpperCase() as WrapMethod;
    if (!HTTP_METHODS.has(method)) {
      errors.push(`request.methods contains an unsupported method "${item}"`);
      continue;
    }
    if (!methods.includes(method)) methods.push(method);
  }
  if (methods.length === 0) return null;

  let primary = methods[0];
  if (typeof source.method === 'string') {
    const requested = source.method.trim().toUpperCase() as WrapMethod;
    if (methods.includes(requested)) primary = requested;
    else errors.push('request.method must be one of request.methods');
  }
  return { primary, methods };
}

/** When to use: rejecting a request URL with a bad scheme, no host, or host templating. */
function validateUrlShape(url: string, errors: string[]): void {
  const match = url.match(/^(https?):\/\//i);
  if (!match) {
    errors.push('request.url must start with http:// or https://');
    return;
  }

  const rest = url.slice(match[0].length);
  const hostEnd = rest.search(/[/?#]/);
  const host = hostEnd === -1 ? rest : rest.slice(0, hostEnd);

  if (!host) {
    errors.push('request.url must include a host');
    return;
  }
  if (host.includes('{{')) {
    errors.push('request.url may template the path or query, but not the host');
  }
  if (host.includes('@')) {
    errors.push('request.url must not contain credentials');
  }
}

/**
 * When to use: turning a raw `request` object into a typed template, appending every
 * problem to `errors` and returning undefined when the request cannot be trusted.
 */
export function normalizeWrapRequest(input: unknown, errors: string[]): WrapRequest | undefined {
  if (!isPlainObject(input)) {
    errors.push('request is required and must be an object');
    return undefined;
  }

  const source = input as Record<string, unknown>;

  let auth: string | undefined;
  if (source.auth !== undefined && source.auth !== null && source.auth !== '') {
    if (typeof source.auth !== 'string' || !IDENTIFIER_PATTERN.test(source.auth) || source.auth.length > 64) {
      errors.push('request.auth must be a secret name (lowercase letters, numbers, dot, dash, or underscore)');
    } else {
      auth = source.auth;
    }
  }

  const methodInfo = normalizeMethods(source, errors);
  const methods = methodInfo?.methods || [];
  const primaryMethod = methodInfo?.primary || 'GET';

  const url = typeof source.url === 'string' ? source.url.trim() : '';
  if (!url) {
    errors.push('request.url is required');
  } else {
    validateUrlShape(url, errors);
  }

  let query: Record<string, unknown> | undefined;
  if (source.query !== undefined) {
    if (!isPlainObject(source.query)) {
      errors.push('request.query must be an object');
    } else {
      query = source.query;
      for (const key of Object.keys(query)) {
        if (CREDENTIAL_QUERY_KEYS.has(key.toLowerCase())) {
          errors.push(`request.query.${key} looks like a credential; query strings end up in logs and proxies — use request.auth (a secret) instead`);
        }
      }
    }
  }

  let headers: Record<string, string> | undefined;
  if (source.headers !== undefined) {
    if (!isPlainObject(source.headers)) {
      errors.push('request.headers must be an object');
    } else {
      headers = {};
      for (const [key, value] of Object.entries(source.headers)) {
        if (typeof value !== 'string') {
          errors.push(`request.headers.${key} must be a string template`);
          continue;
        }
        if (FORBIDDEN_HEADERS.has(key.toLowerCase())) {
          errors.push(`request.headers.${key} cannot be set by a wrapper`);
          continue;
        }
        headers[key] = value;
      }
    }
  }

  let body: unknown;
  if (source.body !== undefined) {
    body = source.body;
    const bodyMethods = methods.filter((method) => method !== 'GET' && method !== 'HEAD');
    if (bodyMethods.length === 0) errors.push(`request.body is not allowed on ${methods.join('/')}`);
    try {
      JSON.stringify(body);
    } catch {
      errors.push('request.body must be JSON-serialisable');
    }
  }

  let bodyFormat: WrapRequest['bodyFormat'];
  if (source.bodyFormat !== undefined) {
    if (typeof source.bodyFormat !== 'string' || !BODY_FORMATS.has(source.bodyFormat)) {
      errors.push('request.bodyFormat must be json, form, or text');
    } else {
      bodyFormat = source.bodyFormat as WrapRequest['bodyFormat'];
    }
  }

  let timeoutMs: number | undefined;
  if (source.timeoutMs !== undefined) {
    if (typeof source.timeoutMs !== 'number' || !Number.isFinite(source.timeoutMs) || source.timeoutMs < 1000) {
      errors.push('request.timeoutMs must be a number of at least 1000');
    } else if (source.timeoutMs > 60_000) {
      errors.push('request.timeoutMs must be at most 60000');
    } else {
      timeoutMs = Math.floor(source.timeoutMs);
    }
  }

  if (!methodInfo || !url) return undefined;

  const request: WrapRequest = { method: primaryMethod, url };
  if (methods.length > 1) request.methods = methods;
  if (query) request.query = query;
  if (headers) request.headers = headers;
  if (source.body !== undefined) request.body = body;
  if (bodyFormat) request.bodyFormat = bodyFormat;
  if (auth) request.auth = auth;
  if (timeoutMs) request.timeoutMs = timeoutMs;
  return request;
}
