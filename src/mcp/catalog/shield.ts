/**
 * Shield & Forms
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const SHIELD_TOOLS: ToolCatalogItem[] = [
  {
    name: 'dismiss_consent',
    description: 'Answer a cookie/GDPR consent wall by choosing the least invasive real control (reject/only-necessary before accept, per KUANG_CONSENT_POLICY=essential|accept|reject). Set force_remove=true only as a last resort when no control exists — that hides the overlay without answering it.',
    parameters: {
      policy: z.enum(['essential', 'accept', 'reject']).optional().describe('How to answer the wall: essential/reject prefer the least-invasive control, accept prefers "Accept all" (default: KUANG_CONSENT_POLICY or essential)'),
      force_remove: z.coerce.boolean().optional().describe('Last resort only: hide the overlay without answering it (no control matched)'),
    },
    endpoint: '/shield/dismiss',
    payload: (args) => ({ policy: args?.policy, force_remove: args?.force_remove === true }),
    format: (data) => {
      const r = data?.result ?? data ?? {};
      const head = r.dismissed
        ? `consent answered (${r.intent || 'accept'} via ${r.framework || 'generic'})`
        : r.blocked
          ? 'consent wall detected, no usable control — left for a human'
          : 'no consent wall detected';
      const bits = [head];
      if (r.targetText) bits.push(`control: "${r.targetText}"`);
      if (r.coordinates) bits.push(`at (${r.coordinates.x}, ${r.coordinates.y})`);
      if (r.message) bits.push(r.message);
      return bits.join(' · ');
    },
  },
  {
    name: 'fill_form',
    description: 'Fills multiple form fields (inputs, textareas, dropdowns, checkboxes, radios) in a single turn with human-like typing cadence.',
    parameters: {
      fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).describe('Map of CSS selectors to values'),
      submit_selector: z.string().optional().describe('Optional CSS selector of submit button'),
    },
    endpoint: '/form/fill',
    payload: (args) => ({ fields: args.fields, submitSelector: args.submit_selector }),
    format: (data) => JSON.stringify(data.result, null, 2),
  },
];
