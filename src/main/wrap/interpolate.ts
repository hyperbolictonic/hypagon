/**
 * Deterministic request construction.
 *
 * The wrapper author writes the shape once:
 *
 *   "body": { "customer": "{{customer_id}}", "line_items": "{{items}}" }
 *
 * The agent supplies `customer_id` and `items`. A placeholder that occupies a
 * whole string keeps the argument's JSON type (an array stays an array); an
 * embedded placeholder is string interpolation. Missing optional values are
 * omitted, never sent as the string "undefined".
 */

import type { WrapMethod, WrapRequest, WrapWrapper } from './types.ts';
import { BuildRequestError, encodeRawPath, interpolateText, interpolateValue, parsePlaceholder, stringifyForTemplate } from './placeholder.js';

export { BuildRequestError, interpolateValue } from './placeholder.js';

/** When to use: inspecting the resolved URL, headers and body before a wrapper sends it. */
export interface BuiltRequest {
  method: WrapMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  bodyFormat?: 'json' | 'form' | 'text';
}

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

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

/** When to use: turning a saved wrapper plus arguments into the outbound HTTP request. */
export function buildRequest(wrapper: WrapWrapper, args: Record<string, unknown>): BuiltRequest {
  const request = wrapper.request;
  const allowedMethods = request.methods?.length ? request.methods : [request.method];
  const requested =
    request.methods && request.methods.length > 1 && args.method !== undefined
      ? String(args.method).toUpperCase()
      : request.method;
  const method = requested as WrapMethod;

  if (!METHODS.has(method) || !allowedMethods.includes(method)) {
    throw new BuildRequestError(
      'METHOD_NOT_ALLOWED',
      `Method "${requested}" is not allowed; use one of ${allowedMethods.join(', ')}.`,
    );
  }

  const rawUrl = interpolateText(request.url, args, true, true);
  if (!rawUrl || rawUrl.includes('{{')) {
    throw new BuildRequestError('UNRESOLVED_TEMPLATE', `The URL still contains a placeholder: "${rawUrl}".`);
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BuildRequestError('INVALID_URL', `"${rawUrl}" is not a valid URL after interpolation.`);
  }

  for (const [key, template] of Object.entries(request.query || {})) {
    const value = interpolateValue(template, args);
    if (value === undefined || value === null) continue;
    appendQuery(url, key, value);
  }

  const headers = buildHeaders(request, args, method);
  const body = buildBody(request, args, method);

  if (body !== undefined && !hasHeader(headers, 'content-type')) {
    const format = bodyFormatOf(request);
    headers['Content-Type'] =
      format === 'json' ? 'application/json' : format === 'form' ? 'application/x-www-form-urlencoded' : 'text/plain; charset=utf-8';
  }

  return {
    method,
    url: url.toString(),
    headers,
    body,
    bodyFormat: body === undefined ? undefined : bodyFormatOf(request),
  };
}

/** When to use: logging or previewing request headers without credential values. */
export function redactHeaders(headers: Record<string, string>, extraSensitive: string[] = []): Record<string, string> {
  const sensitive = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'api-key',
    'apikey',
    'x-auth-token',
    'x-access-token',
    ...extraSensitive.map((name) => name.toLowerCase()),
  ]);
  const redacted: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    redacted[key] = sensitive.has(key.toLowerCase()) ? '<redacted>' : value;
  }
  return redacted;
}

function buildHeaders(request: WrapRequest, args: Record<string, unknown>, method: WrapMethod): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, template] of Object.entries(request.headers || {})) {
    const lower = name.toLowerCase();
    if (FORBIDDEN_HEADERS.has(lower)) {
      throw new BuildRequestError('FORBIDDEN_HEADER', `Header "${name}" cannot be set by a wrapper.`);
    }
    const value = interpolateText(template, args, false);
    if (value === '') continue;
    headers[name] = value;
  }

  if (method === 'GET' || method === 'HEAD') {
    // A body on these is almost always a mistake; fail loudly rather than let
    // fetch silently ignore it.
    if (request.body !== undefined) throw new BuildRequestError('BODY_NOT_ALLOWED', `${method} requests cannot have a body.`);
  }

  return headers;
}

function buildBody(request: WrapRequest, args: Record<string, unknown>, method: WrapMethod): string | undefined {
  if (method === 'GET' || method === 'HEAD' || request.body === undefined) return undefined;

  const value = interpolateValue(request.body, args);
  if (value === undefined) return undefined;

  const format = bodyFormatOf(request);

  if (format === 'json') {
    try {
      return JSON.stringify(value);
    } catch {
      throw new BuildRequestError('INVALID_BODY', 'The request body could not be serialised as JSON.');
    }
  }

  if (format === 'form') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const params = new URLSearchParams();
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        appendForm(params, key, entry);
      }
      return params.toString();
    }
    return stringifyForTemplate(value);
  }

  return stringifyForTemplate(value);
}

function bodyFormatOf(request: WrapRequest): 'json' | 'form' | 'text' {
  if (request.bodyFormat) return request.bodyFormat;
  return typeof request.body === 'string' ? 'text' : 'json';
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === name);
}

function appendQuery(url: URL, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    url.searchParams.delete(key);
    for (const item of value) {
      if (item === undefined || item === null) continue;
      url.searchParams.append(key, stringifyForTemplate(item));
    }
    return;
  }
  url.searchParams.set(key, stringifyForTemplate(value));
}

function appendForm(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) appendForm(params, key, item);
    return;
  }
  params.append(key, stringifyForTemplate(value));
}

