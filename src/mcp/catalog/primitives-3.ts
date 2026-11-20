/**
 * Primitives Layer — one observe / act / wait / extract model. (part 3 of 5)
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const PRIMITIVES_3_TOOLS: ToolCatalogItem[] = [
  {
    name: 'deep_crawl',
    description:
      'Breadth-first crawl from a seed URL: follows same-origin links up to max_depth / max_pages, distills every page to Markdown, and indexes it into LanceDB Cortex. ' +
      'Each page takes the cheap path first — content-negotiated Markdown/Text when the site advertises it, otherwise a detached render (your active tab is not disturbed). ' +
      'Use match_patterns (glob "…/docs/*" or /regex/) to scope, and same_origin=false to allow cross-site hops. Returns a per-page summary.',
    parameters: {
      url: z.string().describe('Seed URL (http/https)'),
      max_depth: z.coerce.number().optional().default(2).describe('Link depth from the seed (0 = seed only; max 5)'),
      max_pages: z.coerce.number().optional().describe('Hard page budget (max 25; default: Research settings)'),
      match_patterns: z.array(z.string()).optional().describe('Glob or /regex/ allow-list applied to child URLs (e.g. ["/docs/*", "/builds/*"])'),
      same_origin: z.coerce.boolean().optional().describe('Stay on the seed origin (default true)'),
      prefer_llm: z.coerce.boolean().optional().describe('Try content-negotiated Markdown/Text before rendering (default true)'),
      harvest_to_cortex: z.coerce.boolean().optional().describe('Index each page into LanceDB Cortex (default true)'),
      selector: z.string().optional().describe('Scope link extraction to a CSS selector'),
      delay_ms: z.coerce.number().optional().describe('Politeness delay between pages in ms (default: 300, or Research settings when stealth is on)'),
      concurrency: z.coerce.number().optional().describe('Parallel page fetches (1-4). Keep at 1 for politeness/stealth; higher values raise WAF risk.'),
    },
    endpoint: '/crawl/deep',
    payload: (args) => ({
      url: args?.url,
      start_url: args?.url,
      max_depth: args?.max_depth,
      max_pages: args?.max_pages,
      match_patterns: args?.match_patterns,
      same_origin: args?.same_origin,
      prefer_llm: args?.prefer_llm,
      harvest_to_cortex: args?.harvest_to_cortex,
      selector: args?.selector,
      delay_ms: args?.delay_ms,
      concurrency: args?.concurrency,
    }),
    format: (data) => {
      const pages = Array.isArray(data.pages) ? data.pages : [];
      const head = `### deep_crawl — ${data.startUrl}\n- ${data.pageCount} page(s) · depth ${data.depthReached} · ${data.cortexIndexed} indexed into Cortex${data.truncated ? ' · truncated at budget' : ''}`;
      const rows = pages.map(
        (p: any, i: number) => `${i + 1}. [d${p.depth} · ${p.via}${p.indexed ? '' : ' · unindexed'}] ${p.title} — ${p.url}${p.error ? ` (error: ${p.error})` : ''}`,
      );
      const notes = (data.notes || []).length ? `\n\nNotes:\n- ${(data.notes || []).join('\n- ')}` : '';
      return `${head}\n${rows.join('\n')}${notes}`;
    },
  },
  {
    name: 'research_topic',
    description:
      'Autonomous research mode: searches the web, gathers the top sources (content-negotiated Markdown/Text when advertised, else a detached render), distills each to Markdown, and indexes them into LanceDB Cortex. ' +
      'Returns EXTRACTIVE, CITED evidence — each source highlight is a real paragraph that mentions the query terms — plus the ranked source list. It does NOT write prose: YOU synthesize the answer (and can follow up with recall_memory over the indexed pages).',
    parameters: {
      query: z.string().describe('Research topic / question'),
      max_sources: z.coerce.number().optional().default(5).describe('Distinct sources to gather (max 8)'),
      engine: z.enum(['google', 'duckduckgo', 'bing', 'brave', 'startpage', 'custom']).optional().describe('Pin one search engine (default: auto chain)'),
      engines: z.array(z.string()).optional().describe('Explicit ordered search-engine fallback chain'),
      url_template: z.string().optional().describe('URL template with {query} for a custom/SearXNG engine'),
      excerpt_chars: z.coerce.number().optional().default(1200).describe('Chars of each source kept for highlighting (max 4000)'),
      harvest_to_cortex: z.coerce.boolean().optional().describe('Index each source into LanceDB Cortex (default true)'),
      prefer_llm: z.coerce.boolean().optional().describe('Try content-negotiated Markdown/Text before rendering (default true)'),
    },
    endpoint: '/research/topic',
    payload: (args) => ({
      query: args?.query,
      max_sources: args?.max_sources,
      engine: args?.engine,
      engines: args?.engines,
      url_template: args?.url_template,
      excerpt_chars: args?.excerpt_chars,
      harvest_to_cortex: args?.harvest_to_cortex,
      prefer_llm: args?.prefer_llm,
    }),
    format: (data) => {
      const sources = Array.isArray(data.sources) ? data.sources : [];
      const head = `### Research: "${data.query}"\n- ${data.sourceCount} source(s) · ${data.cortexIndexed} indexed into Cortex${data.engine ? ` · via ${data.engine}` : ''}`;
      const body = sources
        .map((s: any, i: number) => {
          const hls = (s.highlights || []).map((h: string) => `   • ${h}`).join('\n');
          return `${i + 1}. [${s.title}](${s.url}) [${s.via}${s.indexed ? '' : ' · unindexed'}]${s.snippet ? `\n   ${s.snippet}` : ''}${hls ? `\n${hls}` : ''}${s.error ? `\n   (error: ${s.error})` : ''}`;
        })
        .join('\n');
      const notes = (data.notes || []).length ? `\n\nNotes:\n- ${(data.notes || []).join('\n- ')}` : '';
      return `${head}\n${body}${notes}`;
    },
  },
  {
    name: 'relocate_citation',
    description:
      'Revalidates a citation anchor captured by research_topic/deep_crawl (`source.anchors[].fingerprint`). Renders the URL, relocates the fingerprint, and returns whether it was found, the match score, the current path/text and the top candidates. Use this before trusting a saved quote after a site redesign.',
    parameters: {
      url: z.string().describe('URL to re-check'),
      fingerprint: z.any().describe('The fingerprint object saved from source.anchors[].fingerprint'),
      threshold: z.coerce.number().optional().default(40).describe('Minimum score 0-100 (default 40)'),
    },
    endpoint: '/citation/relocate',
    payload: (args) => ({
      url: args?.url,
      fingerprint: args?.fingerprint,
      threshold: args?.threshold,
    }),
    format: (data) => {
      if (!data.found) {
        const best =
          Array.isArray(data.candidates) && data.candidates[0]
            ? ` — best candidate ${data.candidates[0].score}%`
            : '';
        return `### Citation not found${data.error ? ` — ${data.error}` : best}`;
      }
      return `### Citation found (${data.score}%)\n- ${data.path}\n\n${data.text}`;
    },
  },
  {
    name: 'revalidate_citations',
    description:
      'Revalidates saved citation anchors against the live pages and updates their health scores. Anchors are captured automatically by research_topic/deep_crawl when a query is anchored, and stored in <userData>/research-anchors.json. Omit url to check the most recent stored URLs.',
    parameters: {
      url: z.string().optional().describe('Limit to one URL (default: the most recent stored URLs)'),
      max_urls: z.coerce.number().optional().default(5).describe('Maximum URLs to check (default 5)'),
    },
    endpoint: '/citation/revalidate',
    payload: (args) => ({ url: args?.url, max_urls: args?.max_urls }),
    format: (data) => {
      const results = Array.isArray(data.results) ? data.results : [];
      const head = `### Citations revalidated\n- ${data.checked} checked · ${data.found} found · ${data.missing} missing over ${data.urls} URL(s)`;
      const rows = results.map(
        (r: any) => `- ${r.url}: ${r.found}/${r.checked}${r.error ? ` (${r.error})` : ''}`,
      );
      return `${head}\n${rows.join('\n')}`;
    },
  },
  {
    name: 'collect_all',
    description:
      'Scroll a virtualized/lazy list to the bottom and collect every distinct row (deduped by text+href) in ONE call. The abstraction that replaces a manual scroll-and-harvest sweep. ' +
      'Auto-detects the repeating item container; use selector/ref to scope it and scroll="window" for page-level infinite scroll.',
    parameters: {
      selector: z.string().optional().describe('CSS selector of the list container (default: auto-detect)'),
      ref: z.coerce.number().optional().describe('Mark id of the list container (from find/list_marks)'),
      scroll: z.enum(['container', 'window']).optional().default('container').describe('Scroll the container itself or the whole window'),
      step: z.coerce.number().optional().default(600).describe('Pixels per scroll step'),
      delay_ms: z.coerce.number().optional().default(250).describe('Wait after each scroll for lazy content'),
      max_scrolls: z.coerce.number().optional().default(30).describe('Safety cap on scroll iterations'),
      max: z.coerce.number().optional().default(300).describe('Max rows to collect'),
    },
    endpoint: '/collect',
    payload: (args) => ({
      selector: args?.selector,
      ref: args?.ref,
      scroll: args?.scroll || 'container',
      step: args?.step,
      delay_ms: args?.delay_ms,
      max_scrolls: args?.max_scrolls,
      max: args?.max,
    }),
    format: (data) => {
      if (data.error) return `collect_all failed: ${data.error}`;
      const rows = (data.rows || []).map((r: any, i: number) => `${i + 1}. ${r.text}${r.href ? ` -> ${r.href}` : ''}`);
      return `# collect_all — ${data.count} distinct rows after ${data.scrolls} scrolls\n${rows.join('\n')}`;
    },
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
