/**
 * Rendering and redaction shared by both wrapper cores.
 *
 * The legacy executor and the `anyapi-to-mcp` executor differ in how a request
 * is built and sent; what an agent receives must not. This module holds the
 * parts that are identical either way: recipe rendering, text fences, record
 * extraction, and the credential redaction applied to a payload and an error
 * excerpt. One implementation means a redaction fix cannot land in one core and
 * miss the other.
 */

import { renderRecipe } from '../../../packages/recipe/src/index.ts';
import type { Recipe, RenderMeta, RenderedDocument } from '../../../packages/recipe/src/index.ts';
import type { WrapPreview, WrapRunResult, WrapWrapper } from './types.ts';

/** When to use: reading the result of `renderPayload` — body text or fence plus paging notes. */
export interface Rendered {
  markdown: string;
  records: Record<string, unknown>[];
  documents?: RenderedDocument[];
  meta?: RenderMeta;
}

/** Recipe rendering for one payload, with the legacy fallbacks. */
export function renderPayload(
  wrapper: Pick<WrapWrapper, 'response' | 'name'>,
  json: unknown,
  text: string,
  contentType: string,
  options: { maxChars: number; maxItems?: number },
): Rendered {
  if (json !== undefined && wrapper.response) {
    try {
      const rendered = renderRecipe(json, wrapper.response as Recipe, {
        maxChars: options.maxChars,
        maxItems: options.maxItems,
      });
      return {
        markdown: rendered.markdown,
        records: rendered.records,
        documents: rendered.documents,
        meta: rendered.meta,
      };
    } catch (err: any) {
      return {
        markdown: `_Recipe failed: ${err?.message || err}_\n\n${fence(text, 'text', options.maxChars)}`,
        records: [],
      };
    }
  }

  if (json !== undefined) {
    const pretty = JSON.stringify(json, null, 2);
    return {
      markdown: fence(pretty, 'json', options.maxChars),
      records: toRecords(json),
    };
  }

  if (!text) return { markdown: '_Empty response._', records: [] };

  const label = contentType.includes('html') ? 'html' : 'text';
  return {
    markdown: fence(text, label, options.maxChars),
    records: [],
  };
}

/** When to use: logging or showing a URL without leaking its query or credentials. */
export function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * The preview URL for a plan.
 *
 * A core plan keeps the query string out of `url` (it may hold a secret), so a
 * preview has to put it back. Appending through `URLSearchParams` re-encodes it
 * exactly as the request will.
 */
export function previewUrl(url: string, query: Readonly<Record<string, string>> | undefined): string {
  if (query === undefined) return url;
  const params = new URLSearchParams(query);
  const search = params.toString();
  return search === '' ? url : `${url}${url.includes('?') ? '&' : '?'}${search}`;
}

/** When to use: collecting every encoding of a stored secret before redacting output. */
export function secretVariants(value: string): string[] {
  const variants = new Set<string>();
  if (value) variants.add(value);
  const withoutScheme = value.replace(/^[A-Za-z]+\s+/, '');
  if (withoutScheme && withoutScheme !== value) variants.add(withoutScheme);
  return [...variants];
}

/** When to use: masking secret values in a string before it reaches a log or an agent. */
export function redactText(text: string, values: string[]): string {
  if (!text || values.length === 0) return text;
  let out = text;
  for (const value of values) {
    if (value) out = out.split(value).join('<redacted>');
  }
  return out;
}

/** When to use: recursively redacting secret values in parsed JSON before returning it. */
export function redactDeep(value: unknown, values: string[], depth = 0): unknown {
  if (values.length === 0) return value;
  if (depth > 100) return '<redacted-deep>';
  if (typeof value === 'string') return redactText(value, values);
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, values, depth + 1));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[redactText(key, values)] = redactDeep(entry, values, depth + 1);
    }
    return out;
  }
  return value;
}

/** When to use: decoding a response body as JSON only when the content type or text really is JSON. */
export function parseJson(text: string, contentType: string): unknown {
  if (!text) return undefined;
  const looksJson = contentType.includes('json') || /^\s*[\[{]/.test(text);
  if (!looksJson) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** When to use: normalising a JSON payload into record objects for the records view. */
export function toRecords(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) {
    return json.map((item) => (isPlainObject(item) ? item : { value: item }));
  }
  if (isPlainObject(json)) return [json];
  return [];
}

/** When to use: rendering a body as a fenced code block, clipped to a character budget. */
export function fence(text: string, language: string, maxChars: number): string {
  const clipped = clip(text.trim(), maxChars);
  return clipped ? `\`\`\`${language}\n${clipped}\n\`\`\`` : '_Empty response._';
}

/** When to use: truncating text with a visible marker for previews and logs. */
export function clip(text: string, maxChars: number): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** When to use: building the wrap surface failure envelope (code, message, status). */
export function failure(
  wrapper: { id: string; name: string },
  code: string,
  message: string,
  request?: WrapPreview,
  field?: string,
  retryable?: boolean,
): WrapRunResult {
  return {
    ok: false,
    wrapper,
    request,
    markdown: `**${code}:** ${message}`,
    records: [],
    error: { code, message, field, retryable },
  };
}

/** When to use: checking a parsed value is a JSON object before reading keys off it. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** When to use: bounding a numeric option (limit, timeout) to a supported range. */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
