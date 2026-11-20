/**
 * The anyapi core gate: which wrappers the package can serve exactly.
 *
 * A wrapper that uses a feature the core cannot reproduce is handed to the legacy
 * executor instead of being approximated. This is the single place that decides, so
 * the fallback reason is reportable and testable.
 *
 * When to use: deciding whether a wrapper runs on the anyapi core, or mapping the
 * projected operation back onto the wrapper's own schema.
 */

import type { MapDocument, Operation } from 'anyapi-to-mcp/map';
import type { WrapWrapper } from '../types.ts';

/** When to use: reading a gate verdict (allowed, or the refusal reason). */
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
export function withWrapperRequired(operation: Operation, wrapper: WrapWrapper): Operation {
  if (!operation.input) return operation;
  return { ...operation, input: { ...operation.input, required: wrapper.inputSchema?.required ?? [] } };
}

/** Placeholders in a path the wrapper does not declare as required. */
export function optionalPathArguments(operation: Operation, wrapper: WrapWrapper): string[] {
  const required = new Set(wrapper.inputSchema?.required ?? []);
  const names = [...operation.request.path.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((match) => match[1]!);
  return names.filter((name) => !required.has(name));
}

/** When to use: selecting the projected operation that serves a stored wrapper. */
export function operationOf(map: MapDocument, wrapper: WrapWrapper): Operation | undefined {
  return map.operations.find((operation) => operation.id === wrapper.id) ?? map.operations[0];
}
