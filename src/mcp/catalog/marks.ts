/**
 * Set-of-Marks (SoM) Grounding
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';
import { formatMarks } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const MARKS_TOOLS: ToolCatalogItem[] = [
  {
    name: 'take_annotated_screenshot',
    hidden: true,
    deprecatedInFavorOf: 'take_screenshot',
    description: 'Deprecated alias for take_screenshot(marks:true, detail:"full"). Visual Grounding with Set-of-Marks. Renders high-contrast numbered badges over interactable elements, takes a screenshot, saves to data/screenshots/, and returns both native image and mark mapping. Set include_offscreen=true to also badge elements below/above the fold (long result lists).',
    parameters: {
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also badge interactive elements outside the current viewport (default: false)'),
    },
    endpoint: '/marks/screenshot',
    method: 'GET',
    payload: (args) => ({ queryParams: { include_offscreen: String(args?.include_offscreen === true) } }),
    format: formatMarks,
  },
  {
    name: 'take_economy_screenshot',
    hidden: true,
    deprecatedInFavorOf: 'take_screenshot',
    description: 'Deprecated alias for take_screenshot(marks:true, detail:"economy"). Lightweight Set-of-Marks screenshot: downscaled to 640px wide JPEG (~10-20x smaller than take_annotated_screenshot) plus the same mark mapping. Use for vision models when token/bandwidth cost matters. Set include_offscreen=true to also badge elements below/above the fold.',
    parameters: {
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also badge interactive elements outside the current viewport (default: false)'),
    },
    endpoint: '/marks/screenshot',
    method: 'GET',
    payload: (args) => ({ queryParams: { economy: '1', include_offscreen: String(args?.include_offscreen === true) } }),
    format: formatMarks,
  },
  {
    name: 'list_marks',
    hidden: true,
    deprecatedInFavorOf: 'observe',
    description: 'Deprecated alias for observe(as:"som"). Text-only Set-of-Marks: returns the numbered interactive element table with NO image. Use for text-only models or the cheapest possible page scan; act(mark_id, action) works afterwards. On long/virtualized result lists set include_offscreen=true so below-the-fold items are numbered too (act scrolls them into view).',
    parameters: {
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also number interactive elements outside the current viewport so long result lists are fully listed (default: false)'),
    },
    endpoint: '/marks/screenshot',
    method: 'GET',
    payload: (args) => ({ queryParams: { text_only: '1', include_offscreen: String(args?.include_offscreen === true) } }),
    format: formatMarks,
  },
  {
    name: 'click_mark',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Clicks an annotated element using its Set-of-Marks badge index from take_annotated_screenshot.',
    parameters: {
      mark_id: z.coerce.number().describe('The numeric ID of the mark badge to click (e.g. 1)'),
    },
    endpoint: '/marks/click',
    payload: (args) => {
      const raw = args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number;
      if (raw === undefined || raw === null || isNaN(Number(raw))) {
        throw new Error('Missing mark_id. Please provide { "mark_id": 1 } from take_annotated_screenshot().');
      }
      return { markId: Number(raw) };
    },
    format: (data, args) => `Clicked mark #${args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number}`,
  },
  {
    name: 'type_mark',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Types text into an annotated input element using its Set-of-Marks badge index.',
    parameters: {
      mark_id: z.coerce.number().describe('The numeric ID of the mark badge to type into (e.g. 1)'),
      text: z.string().describe('The text string to type into the marked element (e.g. "London")'),
      clear_first: z.coerce.boolean().optional().default(false).describe('Whether to clear existing text before typing'),
    },
    endpoint: '/marks/type',
    payload: (args) => {
      const rawId = args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number;
      if (rawId === undefined || rawId === null || isNaN(Number(rawId))) {
        throw new Error('Missing mark_id. Please provide { "mark_id": 1, "text": "..." }');
      }
      const text = String(args?.text ?? args?.value ?? args?.content ?? args?.input ?? '');
      const clearFirst = Boolean(args?.clear_first ?? args?.clearFirst ?? false);
      return { markId: Number(rawId), text, clearFirst };
    },
    format: (data, args) => `Typed into mark #${args?.mark_id ?? args?.markId ?? args?.mark ?? args?.id ?? args?.badge ?? args?.index ?? args?.num ?? args?.number}`,
  },
];
