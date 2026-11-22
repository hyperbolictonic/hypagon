import { z } from 'zod';
import { formatMark } from './format-mark.js';
import type { ToolCatalogItem } from './tools-catalog-types.js';

/** When to use: the catalog segment fronting Set-of-Marks grounding: screenshots, the mark registry and mark actuation. */
export const MARKS_TOOLS: ToolCatalogItem[] = [
{
    name: 'take_screenshot',
    description: 'Captures the active viewport. Two modes. PLAIN (default): fast 768px JPEG (~15ms), saved to data/screenshots/, returns the file path plus native image content. SET-OF-MARKS (marks=true): numbered badges on interactive elements — detail="full" (full-res PNG), detail="economy" (640px JPEG, ~10-20x lighter; best for vision), or detail="markdown" (marks table only, NO image; cheapest). Badge ids feed act(mark_id, action).',
    parameters: {
      marks: z.coerce.boolean().optional().default(false).describe('true = Set-of-Marks (badge interactive elements, return the marks table); false = plain viewport image (default)'),
      detail: z.enum(['full', 'economy', 'markdown']).optional().default('full').describe('Only when marks=true: "full" (PNG), "economy" (640px JPEG), or "markdown" (marks table only, no image)'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Only when marks=true: also badge elements outside the viewport (long/virtualized lists)'),
      max_width: z.coerce.number().optional().default(768).describe('Plain mode only: max width in pixels (default 768; pass 0 for full native resolution)'),
      format: z.enum(['jpeg', 'png']).optional().default('jpeg').describe('Plain mode only: image format (default "jpeg")'),
      quality: z.coerce.number().optional().default(70).describe('Plain mode only: JPEG quality 1-100 (default 70)'),
    },
    endpoint: '/screenshot',
    endpoints: ['/screenshot', '/marks/screenshot'],
    method: 'GET',
    endpointFor: (args) => (args?.marks === true ? '/marks/screenshot' : '/screenshot'),
    payload: (args) => {
      if (args?.marks === true) {
        const detail = args?.detail || 'full';
        return {
          queryParams: {
            ...(detail === 'economy' ? { economy: '1' } : {}),
            ...(detail === 'markdown' ? { text_only: '1' } : {}),
            include_offscreen: String(args?.include_offscreen === true),
          },
        };
      }
      const maxWidth = args?.max_width !== undefined ? Number(args.max_width) : 768;
      const format = args?.format || 'jpeg';
      const quality = args?.quality !== undefined ? Number(args.quality) : 70;
      return { queryParams: { max_width: String(maxWidth), format, quality: String(quality) } };
    },
    format: (data) => data.screenshot?.filePath ? `Screenshot saved to ${data.screenshot.filePath} (${data.screenshot.width || ''}x${data.screenshot.height || ''}px, ${data.screenshot.mimeType || 'image/jpeg'})` : 'Screenshot captured',
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
    format: (data) => (Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data)),
  },
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
    format: (data) => (Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data)),
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
    format: (data) => (Array.isArray(data.marks) ? data.marks.map((m: any) => formatMark(m)).join('\n') : JSON.stringify(data)),
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
{
    name: 'frames',
    description:
      'Lists the page\'s iframes as first-class content instead of blank boxes: each frame\'s top-level rect, URL, and the controls inside it with coordinates ALREADY offset into the page viewport. ' +
      'Pass screenshots=true to get one image per visible frame, which is how a cross-origin widget, embedded checkout or consent wall becomes something the model can actually look at. ' +
      'Feed the returned control x/y to act(x, y). Marks/find remain main-frame by default, so this is the tool for anything inside an iframe.',
    parameters: {
      include_controls: z.coerce.boolean().optional().default(true).describe('Describe the controls inside each frame (default: true)'),
      screenshots: z.coerce.boolean().optional().default(false).describe('Return one cropped image per visible frame (default: false; opt-in because it costs a capture)'),
      selector: z.string().optional().describe('Restrict the in-frame control scan to this CSS selector'),
      max_frames: z.coerce.number().optional().default(6).describe('Frame budget, breadth-first (default: 6, max: 16)'),
      max_controls: z.coerce.number().optional().default(40).describe('Max controls to describe per frame (default: 40, max: 200)'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also include frames/controls outside the viewport (default: false)'),
      max_side: z.coerce.number().optional().default(1024).describe('Longest side of a frame screenshot in px (default: 1024)'),
    },
    endpoint: '/frames',
    payload: (args) => ({
      include_controls: args?.include_controls,
      screenshots: args?.screenshots === true,
      selector: args?.selector,
      max_frames: args?.max_frames,
      max_controls: args?.max_controls,
      include_offscreen: args?.include_offscreen === true,
      max_side: args?.max_side,
    }),
    format: (data) => {
      const frames = Array.isArray(data.frames) ? data.frames : [];
      const vp = data.viewport || {};
      const lines = [`# frames — ${Math.max(0, frames.length - 1)} child frame(s), viewport ${vp.width || '?'}x${vp.height || '?'}`];
      for (const frame of frames) {
        const where = frame.depth === 0 ? 'main' : frame.rect ? `${frame.rect.width}x${frame.rect.height} @ (${frame.rect.x}, ${frame.rect.y})` : 'no geometry';
        const origin = frame.crossOrigin ? 'cross-origin' : frame.depth === 0 ? 'top document' : 'same-origin';
        lines.push(`[${frame.depth}] ${where} — ${frame.url || '(blank)'}${frame.name ? ` "${frame.name}"` : ''} — ${origin}${frame.error ? ` — ${frame.error}` : ''}`);
        for (const control of frame.controls || []) {
          const name = control.name || control.value || '';
          const actions = (control.actions || []).join('/');
          const flags = [control.occluded ? 'occluded' : '', control.visible ? '' : 'hidden', control.disabled ? 'disabled' : ''].filter(Boolean);
          lines.push(`    <${control.tag}> "${name}" @ (${control.rect.x}, ${control.rect.y})${actions ? ` {${actions}}` : ''}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
        }
        if (frame.controlsTotal !== undefined && frame.controlsTotal > (frame.controls || []).length) {
          lines.push(`    … ${frame.controlsTotal - (frame.controls || []).length} more control(s) not shown`);
        }
      }
      for (const note of data.notes || []) lines.push(`note: ${note}`);
      if (Array.isArray(data.images) && data.images.length) lines.push(`${data.images.length} frame image(s) attached.`);
      return lines.join('\n');
    },
  },
];
