/**
 * Turning a projected plan into the published wrapper surface.
 *
 * Two jobs: keep only the arguments the wrapper actually declares (the core's plan
 * may offer more), and build a preview whose header values are redacted.
 *
 * When to use: preparing arguments or a dry-run preview for the anyapi core.
 */

import type { Operation } from 'anyapi-to-mcp/map';
import type { DryRunPlan } from 'anyapi-to-mcp/runtime';
import { previewUrl } from '../render.ts';
import type { WrapPreview } from '../types.ts';

/** When to use: dropping arguments the wrapper's own schema does not declare. */
export function pickDeclared(value: Record<string, unknown>, operation: Operation): Record<string, unknown> {
  const properties = operation.input?.properties;
  if (!properties) return {};
  const declared = new Set(Object.keys(properties));
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (declared.has(key)) out[key] = entry;
  }
  return out;
}

/** When to use: a preview from the core's plan — header names only, every value redacted. */
export function previewFromPlan(plan: DryRunPlan): WrapPreview {
  const headers: Record<string, string> = {};
  for (const name of plan.headers) headers[name] = '<redacted>';
  return {
    method: plan.method as WrapPreview['method'],
    url: previewUrl(plan.url, plan.query),
    headers,
    ...(plan.body === undefined ? {} : { body: plan.body }),
  };
}
