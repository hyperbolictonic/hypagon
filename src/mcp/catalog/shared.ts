/**
 * The catalog vocabulary: the shape of one tool entry and the three formatters entries share.
 *
 * Kept apart from the entries so a family file imports only what it uses.
 */
import { z } from 'zod';
import { formatMark } from '../format-mark.js';

/** When to use: defining one tool (name, description, params, endpoint, formatter). */
export interface ToolCatalogItem {
  name: string;
  description: string;
  parameters: Record<string, z.ZodTypeAny>;
  endpoint: string;
  method?: 'GET' | 'POST';
  payload?: (args: any) => any;
  format?: (data: any, args: any) => string;
  /** Resolves the endpoint per call (one tool fronting two routes). Defaults to `endpoint`. */
  endpointFor?: (args: any) => string;
  /** Every route this tool may call; validated by the contract test. Defaults to `[endpoint]`. */
  endpoints?: string[];
  /**
   * Hidden from `tools/list` (and therefore from agent tool pickers) but still
   * callable by name via `tools/call` for one release. Used for deprecated
   * aliases and renamed tools; see docs/TOOL_CATALOG_REVIEW.md.
   */
  hidden?: boolean;
  /** Canonical tool this deprecated name forwards to (drives the call-time notice). */
  deprecatedInFavorOf?: string;
}

/** When to use: normalizing a navigation destination (bare hosts get https://, explicit schemes pass through). */
export function normalizeDestination(args: any): string {
  let targetUrl = args?.url || args?.destination || args?.target || args?.link || args?.href || args?.address || '';
  if (typeof targetUrl === 'string' && targetUrl) {
    if (!/^https?:\/\//i.test(targetUrl) && !/^about:/i.test(targetUrl) && !/^mark-eleven:/i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }
  }
  if (!targetUrl) {
    throw new Error('Missing destination URL. Please provide { "url": "https://..." }');
  }
  return targetUrl;
}

/** When to use: rendering a route's marks as one line each, or the raw payload when there are none. */
export function formatMarks(data: any): string {
  return Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data);
}

/** When to use: the default result format for structured tools. */
export const jsonPretty = (data: any): string => JSON.stringify(data, null, 2);

/** When to use: iterating or looking up the agent tool surface. */
