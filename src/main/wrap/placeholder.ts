/**
 * Wrapper placeholder engine: parsing and resolving {{placeholders}}.
 *
 * Whole-string placeholders keep the argument's JSON type (an array stays an array);
 * embedded placeholders are string interpolation. Raw path segments are encoded
 * segment-by-segment and reject traversal. Missing optional values resolve to
 * undefined/empty, never the string "undefined".
 *
 * When to use: resolving template values for a wrapper request, or reporting a
 * template that cannot be resolved. Request assembly itself lives in interpolate.ts.
 */

import { resolvePath } from '../../../packages/recipe/src/index.ts';

/** When to use: reporting a wrapper template that cannot be resolved into a request. */
export class BuildRequestError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BuildRequestError';
    this.code = code;
  }
}

const WHOLE_PLACEHOLDER = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const PLACEHOLDER = /\{\{\s*([^{}]+?)\s*\}\}/g;
const RAW_PATH_SUFFIX = /^(.*?)\s*\|\s*raw$/i;
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);

interface Placeholder {
  name: string;
  rawPath: boolean;
}

/** When to use: splitting `name` from the optional `|raw` path modifier in a placeholder. */
export function parsePlaceholder(expression: string): Placeholder {
  const trimmed = expression.trim();
  const raw = trimmed.match(RAW_PATH_SUFFIX);
  if (raw && raw[1].trim()) return { name: raw[1].trim(), rawPath: true };
  return { name: trimmed, rawPath: false };
}

/** When to use: resolving placeholders inside one template string (whole-value or embedded). */
export function interpolateText(
  template: string,
  args: Record<string, unknown>,
  encode: boolean,
  allowRawPath = false,
): string {
  if (typeof template !== 'string') return '';

  const whole = template.match(WHOLE_PLACEHOLDER);
  if (whole) return resolvePlaceholder(whole[1], args, encode, allowRawPath);

  return template.replace(PLACEHOLDER, (_match, expression: string) =>
    resolvePlaceholder(expression, args, encode, allowRawPath),
  );
}

/** Resolve one placeholder expression to text; the whole-value and embedded paths share this. */
function resolvePlaceholder(
  expression: string,
  args: Record<string, unknown>,
  encode: boolean,
  allowRawPath: boolean,
): string {
  const placeholder = parsePlaceholder(expression);
  if (placeholder.rawPath && !allowRawPath) {
    throw new BuildRequestError('INVALID_TEMPLATE', 'The "|raw" path modifier is only allowed in request.url.');
  }
  const value = getArg(args, placeholder.name);
  if (value === undefined || value === null) return '';
  return placeholder.rawPath
    ? encodeRawPath(value)
    : encode
      ? encodeURIComponent(stringifyForTemplate(value))
      : stringifyForTemplate(value);
}

/**
 * Preserve slash-separated path segments while encoding each segment. Raw paths are relative:
 * leading/trailing slashes are ignored, `.`/`..` segments are rejected, and backslashes/control
 * characters are refused before URL construction.
 */
/** When to use: encoding a `|raw` path value segment-by-segment, rejecting traversal. */
export function encodeRawPath(value: unknown): string {
  const raw = stringifyForTemplate(value);
  if (!raw) throw new BuildRequestError('INVALID_PATH', 'The raw path is empty.');
  if (raw.includes('\\') || /[\u0000-\u001f\u007f]/.test(raw)) {
    throw new BuildRequestError('INVALID_PATH', 'The raw path contains a forbidden character.');
  }

  const normalized = raw.replace(/^\/+|\/+$/g, '');
  const segments = normalized.split('/');
  if (!normalized || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new BuildRequestError(
      'INVALID_PATH',
      'The raw path must not contain empty, "." or ".." segments.',
    );
  }
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

/** When to use: resolving `{{placeholders}}` inside a wrapper template value. */
export function interpolateValue(value: unknown, args: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const whole = value.match(WHOLE_PLACEHOLDER);
    if (whole) {
      const placeholder = parsePlaceholder(whole[1]);
      if (placeholder.rawPath) {
        throw new BuildRequestError(
          'INVALID_TEMPLATE',
          'The "|raw" path modifier is only allowed in request.url.',
        );
      }
      return getArg(args, placeholder.name);
    }
    return value.replace(PLACEHOLDER, (_match, expression: string) => {
      const placeholder = parsePlaceholder(expression);
      if (placeholder.rawPath) {
        throw new BuildRequestError(
          'INVALID_TEMPLATE',
          'The "|raw" path modifier is only allowed in request.url.',
        );
      }
      const resolved = getArg(args, placeholder.name);
      return resolved === undefined || resolved === null ? '' : stringifyForTemplate(resolved);
    });
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => interpolateValue(item, args))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const resolved = interpolateValue(entry, args);
      if (resolved !== undefined) out[key] = resolved;
    }
    return out;
  }

  return value;
}

/** When to use: resolving a dotted argument path, with `.`/`$` meaning the whole args object. */
export function getArg(args: Record<string, unknown>, path: string): unknown {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '.' || trimmed === '$') return args;
  return resolvePath(args, trimmed);
}

/** When to use: turning an argument into text for a template (JSON for arrays/objects). */
export function stringifyForTemplate(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
