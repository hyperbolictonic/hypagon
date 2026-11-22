import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { formatMark } from './format-mark.js';
import { normaliseUrl, requireUrl } from './tool-args.js';
import { BRAND } from '../shared/brand.js';

/** When to use: the LLM surface, research, citation and frame-actuation entries. */
export const RESEARCH_TOOLS: ToolCatalogItem[] = [
  {
    name: 'llm_surface',
    description:
      'Checks whether a site publishes an LLM-friendly representation — a `/llms.txt` / `/llms-full.txt` index, a `/sitemap.xml`, a page-level Markdown/Text alternate (a declared `<link rel="alternate">`, or a real `<a href="….md">` link on the page), or Markdown content negotiation — so you can read it as text instead of rendering. ' +
      'Returns `recommended`: "llms_txt" | "llms_full" | "markdown" | "text", or **null** when the site advertises none (never "rendered"). Also returns `scope` ("origin" for a site-wide index, "page" for this page) and `next` — the unambiguous next step: `{tool:"llm_fetch", as}` when something is fetchable, else `{tool:"observe", as:"markdown"}`. A null `recommended` is NOT a fetch target: follow `next`, or just call `read_url`. Only well-known paths are probed and results are cached per origin; url defaults to the active tab.',
    parameters: {
      url: z.string().optional().describe('Site or page URL to inspect (default: the active tab)'),
    },
    endpoint: '/llm/surface',
    payload: (args) => ({ url: args?.url }),
    format: (data) => {
      const rec = data.recommended
        ? `**${data.recommended}**${data.scope ? ` (${data.scope} scope)` : ''}`
        : '**none** — render the page';
      const next =
        data.next?.tool === 'llm_fetch' ? `llm_fetch({ as: "${data.next.as}" })` : 'observe({ as: "markdown" })';
      const lines = [
        `### LLM surface — ${data.origin || data.url}`,
        `- recommended: ${rec}`,
        `- next: ${next}`,
        `- llms.txt: ${data.llms_txt?.found ? `${data.llms_txt.url} (${data.llms_txt.bytes}B)` : '—'}`,
        `- llms-full.txt: ${data.llms_full?.found ? `${data.llms_full.url} (${data.llms_full.bytes}B)` : '—'}`,
        `- sitemap.xml: ${data.sitemap?.found ? `${data.sitemap.url} (${data.sitemap.entries ?? 0} urls)` : '—'}`,
        `- markdown alternates: ${data.markdown_alternates?.length ? data.markdown_alternates.map((a: any) => `${a.href}${a.source === 'anchor' ? ' (from a page link)' : ''}`).join(', ') : '—'}`,
        `- accepts markdown (negotiation): ${data.content_negotiation?.accepts_markdown ? 'yes' : 'no'}`,
      ];
      if (!data.recommended) {
        lines.push('', 'No fetchable LLM surface — read it with `read_url` (or `observe({ as: "markdown" })`).');
      }
      if (data.notes?.length) lines.push('', ...data.notes.map((n: string) => `> ${n}`));
      return lines.join('\n');
    },
  },
  {
    name: 'llm_fetch',
    description:
      'Fetches a site-provided Markdown/Text representation that `llm_surface` found — an `/llms.txt` index, a page-level Markdown/Text alternate, or a negotiated Markdown body. ' +
      'GATED: it refuses with NO_LLM_SURFACE unless the site actually advertises a surface, and never fetches arbitrary URLs or guesses paths. The result carries `scope` ("origin"|"page") and `scope_mismatch` — true when you asked for a page but only a site-wide index exists. For the rendered page use `observe({ as: "markdown" })`; for one call that always returns text use `read_url`.',
    parameters: {
      url: z.string().optional().describe('Site or page URL (default: the active tab)'),
      as: z.enum(['llms_txt', 'llms_full', 'markdown', 'text']).optional().describe('Which advertised representation to fetch (default: the probe\'s recommended)'),
    },
    endpoint: '/llm/fetch',
    payload: (args) => ({ url: args?.url, as: args?.as }),
    format: (data) => {
      const warn = data.scope_mismatch ? '\n> Scope mismatch: you asked for a page, but this is the site-wide index.' : '';
      return `### llm_fetch ${data.as} · ${data.url} (${data.contentType || 'unknown'}, ${data.bytes} bytes, ${data.scope} scope, via ${data.via})${warn}\n\n${data.content || ''}`;
    },
  },
  {
    name: 'read_url',
    description:
      'Reads a URL as Markdown in ONE call — the composite front door. Reads the site\'s own LLM-friendly representation when one covers the URL you asked for (a page-level Markdown/Text alternate for a page); otherwise it renders the URL in a DETACHED view (your active tab is never hijacked) and distils it to Markdown. ' +
      'Always returns Markdown text, so you never have to branch on `llm_surface.recommended`. A site-wide `/llms.txt` index is never returned in place of a page — the page is rendered instead, and `reason` says why. Reports `via` ("llm_fetch"|"render"), `scope` ("origin"|"page"), `scope_mismatch` and `reason`. PAGED: pass `max_chars` and follow the machine-readable `next_cursor=<offset>` fact when the result is truncated.',
    parameters: {
      url: z.string().optional().describe('URL to read as Markdown (default: the active tab)'),
      max_chars: z.coerce.number().optional().describe('Maximum characters to return per call (default 20000, cap 50000)'),
      cursor: z.union([z.string(), z.number()]).optional().describe('Character offset to continue from (the previous call\'s next_cursor)'),
      as: z.enum(['llms_txt', 'llms_full', 'markdown', 'text']).optional().describe('Force a specific advertised representation instead of the probe\'s recommendation'),
    },
    endpoint: '/read/url',
    payload: (args) => ({ url: args?.url, max_chars: args?.max_chars, cursor: args?.cursor, as: args?.as }),
    format: (data) => {
      const how = data.via === 'llm_fetch' ? `site-provided ${data.as}` : 'rendered';
      const returned = data.content?.length || 0;
      const facts = [
        `chars=${returned} of ${data.total}`,
        `offset=${data.offset}`,
        `scope=${data.scope}`,
        ...(data.scope_mismatch ? ['scope_mismatch=true'] : []),
        ...(data.truncated ? [`next_cursor=${data.next_cursor}`] : []),
      ];
      const head = [`### read_url · ${how} · ${data.url}`, `- ${facts.join(' · ')}`];
      if (data.title) head.push(`- title: ${data.title}`);
      if (data.reason) head.push(`- rendered because: ${data.reason}`);
      if (data.truncated) {
        head.push(`- continue: read_url({ url: "${data.url}", cursor: ${data.next_cursor} })`);
      }
      return `${head.join('\n')}\n\n${data.content || ''}`;
    },
  },
  {
    name: 'search_web',
    description:
      'Runs a web search and returns ranked results {rank, title, url, snippet}. Each engine loads in a detached view (your active tab is NOT disturbed) and the hub falls back across engines when one returns nothing (bot-check/consent wall). ' +
      'engines: google | duckduckgo | bing | brave | startpage | custom (custom needs url_template containing {query}, e.g. a SearXNG instance). Results are plain URLs to feed navigate_to or collect_all.',
    parameters: {
      query: z.string().describe('Search query'),
      engine: z.enum(['google', 'duckduckgo', 'bing', 'brave', 'startpage', 'custom']).optional().describe('Pin a single engine (default: auto chain google → duckduckgo → brave)'),
      engines: z.array(z.string()).optional().describe('Explicit ordered fallback chain (overrides engine)'),
      url_template: z.string().optional().describe('URL template containing {query} for a custom/SearXNG engine'),
      max_results: z.coerce.number().optional().describe('Max results to return (default: Research settings)'),
    },
    endpoint: '/search/web',
    payload: (args) => ({
      query: args?.query,
      engine: args?.engine,
      engines: args?.engines,
      url_template: args?.url_template,
      max_results: args?.max_results,
    }),
    format: (data) => {
      const results = Array.isArray(data.results) ? data.results : [];
      if (results.length === 0) {
        const tried = (data.attempts || [])
          .map((a: any) => `${a.engine}${a.error ? `(${a.error})` : a.blocked ? '(blocked)' : '(0)'}`)
          .join(', ');
        return `### Search "${data.query}" — no results\nTried: ${tried || 'none'}\n${data.notes || ''}`.trim();
      }
      const lines = results.map((r: any) => `${r.rank}. [${r.title}](${r.url})${r.snippet ? `\n   ${r.snippet}` : ''}`);
      return `### Search "${data.query}" — ${results.length} results (${data.engine})\n${lines.join('\n')}`;
    },
  },
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
  {
    name: 'find',
    description:
      'Semantic element search. Returns Set-of-Marks refs (mark ids) for the light/open DOM, and with sealed:true also returns controls inside closed shadow roots as coordinates (no mark id) — feed those to act(x, y). Filter by role, accessible/text name, regex, tag or CSS selector.',
    parameters: {
      role: z.string().optional().describe('ARIA role or implied role (e.g. "button", "link", "combobox")'),
      name: z.string().optional().describe('Accessible-name substring (case-insensitive)'),
      contains: z.string().optional().describe('Text/value substring'),
      regex: z.string().optional().describe('Regex over text/value'),
      tag: z.string().optional().describe('Element tag, e.g. "A" or "BUTTON"'),
      selector: z.string().optional().describe('CSS selector the element must match (light/open DOM only)'),
      limit: z.coerce.number().optional().default(25).describe('Max refs to return'),
      include_offscreen: z.coerce.boolean().optional().default(true).describe('Also search below/above the fold (default: true)'),
      sealed: z.coerce.boolean().optional().default(false).describe('Also search inside closed shadow roots (opt-in; cached and rate-limited)'),
      include_frames: z.coerce.boolean().optional().default(false).describe('Also search child frames; returns 100+ mark ids usable with act(mark_id)'),
      refresh: z.coerce.boolean().optional().default(false).describe('Force a fresh sealed scan instead of the short identity cache'),
    },
    endpoint: '/find',
    payload: (args) => ({
      role: args?.role,
      name: args?.name,
      contains: args?.contains,
      regex: args?.regex,
      tag: args?.tag,
      selector: args?.selector,
      limit: args?.limit,
      include_offscreen: args?.include_offscreen,
      sealed: args?.sealed,
      include_frames: args?.include_frames,
      refresh: args?.refresh,
    }),
    format: (data) => {
      const rows = (data.marks || []).map((m: any) => formatMark(m));
      const sealedRows = (data.sealed || []).map((c: any) => {
        const cx = Math.round(c.rect.x + c.rect.width / 2);
        const cy = Math.round(c.rect.y + c.rect.height / 2);
        const flags = [c.inViewport === false ? 'offscreen' : '', c.disabled ? 'disabled' : ''].filter(Boolean);
        const token = c.token ? ` token=${c.token}` : '';
        return `[sealed] <${c.role}> "${c.name}" @ (${cx}, ${cy})${flags.length ? ` {${flags.join(', ')}}` : ''}${token}`;
      });
      const sealedNote = data.sealedTotal !== undefined
        ? `\nsealed: ${(data.sealed || []).length} of ${data.sealedTotal}${data.sealedCached ? ' (cached)' : ''}`
        : '';
      return `# find — ${data.count} of ${data.total} match(es)${sealedNote}\n${rows.concat(sealedRows).join('\n')}`;
    },
  },
  {
    name: 'expect',
    description: 'Immediate assertion (no polling) over the same condition vocabulary as wait_for. Returns pass/fail plus per-condition evidence, so an agent can self-check before proceeding instead of guessing.',
    parameters: {
      conditions: z.array(z.record(z.string(), z.any())).describe('Conditions to assert immediately, e.g. [{"type":"text","text":"GBP"},{"type":"url","pattern":"/flights"}]'),
    },
    endpoint: '/expect',
    payload: (args) => ({ conditions: args?.conditions || (args?.condition ? [args.condition] : []) }),
    format: (data) => {
      const lines = (data.results || []).map((r: any) => `${r.ok ? '✓' : '✗'} ${r.type}${r.evidence ? ` — ${r.evidence}` : ''}`);
      return `${data.ok ? 'PASS' : 'FAIL'} (${data.results.filter((r: any) => r.ok).length}/${data.results.length} conditions)\n${lines.join('\n')}`;
    },
  },
  {
    name: 'focus_walk',
    description:
      'Enter a closed shadow root like a keyboard user: focus the host, then send trusted Tab (or Shift+Tab) steps and read the accessibility tree to confirm which inner control actually has focus. Stops when focus leaves the host, the step budget is spent, or focus is lost. Use act(action:"press", text:"Enter") to activate the landed control.',
    parameters: {
      selector: z.string().optional().describe('Light-DOM host selector to start from'),
      x: z.coerce.number().optional().describe('Viewport x of the host (when there is no stable selector)'),
      y: z.coerce.number().optional().describe('Viewport y of the host'),
      direction: z.enum(['forward', 'backward']).optional().default('forward').describe('Tab or Shift+Tab'),
      max_steps: z.coerce.number().optional().default(8).describe('Maximum key presses (1-12)'),
      restore: z.coerce.boolean().optional().default(true).describe('Return focus to the host if the walk fails'),
    },
    endpoint: '/focus_walk',
    payload: (args) => ({
      selector: args?.selector,
      x: args?.x,
      y: args?.y,
      direction: args?.direction,
      max_steps: args?.max_steps,
      restore: args?.restore,
    }),
    format: (data) => {
      const steps = Array.isArray(data.steps) ? data.steps : [];
      const rows = steps.map((s: any) => {
        const label = s.index === 0 ? 'initial' : `#${s.index}`;
        const cx = Math.round(s.rect.x + s.rect.width / 2);
        const cy = Math.round(s.rect.y + s.rect.height / 2);
        return `${label} <${s.role}> "${s.name}" @ (${cx}, ${cy})`;
      });
      const median = data.medianStepGapMs !== undefined ? ` median=${data.medianStepGapMs}ms` : '';
      return `focus_walk — landed=${data.landed} reason=${data.reason} steps=${steps.length}${median}\n${rows.join('\n')}`;
    },
  },
  {
    name: 'act',
    description:
      'Click, focus, hover, type into, or press on one page target. Address the target by: mark_id (preferred - a Set-of-Marks badge, resilient to layout shifts), a CSS selector, x/y viewport coordinates, or target_text for controls with no semantics (React cards: a div with a handler three levels up, no role/href/onclick). ' +
      'Selectors resolve through open shadow roots and, for a custom-element host, to the control a mouse would actually hit — so `#email` or `my-text-input` reaches the real <input>, not the host wrapper. ' +
      'Returns a before/after delta; pass await_conditions to do "act then wait" in one round trip, and dry_run=true to resolve the target without acting. secret=true redacts typed text from logs. For action="type", pass clear_first=true on a pre-filled field so the value is REPLACED (select-all + delete) rather than appended to. action="press" needs no target. ' +
      'Typing is VERIFIED: the control\'s value is read before and after, and if nothing changed the result is ok:false with error.code "TYPE_NO_EFFECT", a `typing` evidence object (key counts, value lengths — never the text) and a hint that distinguishes "input never arrived" (focus/window) from "the control rejects synthetic input" (one-time-code/OTP → request_human_intervention). ' +
      'Use action="fill" with a fields map to fill several controls in one call. NOT for navigation (use navigate_to) or scrolling (use scroll_page). ' +
      'HUMAN_IN_PROGRESS means a person just used the browser: synthetic input is paused for a short quiet window. Do not retry in a loop — poll /human/status, wait for idle, then re-observe. ' +
      'Choosing the target is a separate job: when a decision model is configured AND two or more controls plausibly match, prefer observe(as:"components") -> decide -> act(mark_id); when exactly one control matches, find/act is faster and deterministic.',
    parameters: {
      mark_id: z.coerce.number().optional().describe('Target Set-of-Marks badge id from observe/find/take_screenshot (preferred)'),
      selector: z.coerce.string().optional().describe('CSS selector of the target, when you have no mark id (e.g. "button.submit", "#search-input")'),
      x: z.coerce.number().optional().describe('Viewport X for coordinate targeting (pair with y)'),
      y: z.coerce.number().optional().describe('Viewport Y for coordinate targeting (pair with x)'),
      target_text: z.string().optional().describe('Anchor by visible text when the control has no semantics (React card divs, handler-only elements). Resolves the deepest visible element containing the text; refuses when more than one match is ambiguous'),
      sealed_token: z.string().optional().describe('Opaque token from find(sealed:true); scrolls/re-measures the sealed control before acting'),
      action: z.enum(['click', 'focus', 'hover', 'type', 'press', 'fill']).default('click').describe('Action to perform (default: "click")'),
      text: z.string().optional().describe('Text for action="type"; key name for action="press" (e.g. "Enter")'),
      fields: z.record(z.string(), z.union([z.string(), z.boolean(), z.number()])).optional().describe('For action="fill": map of CSS selectors to values'),
      submit_selector: z.string().optional().describe('For action="fill": optional submit button selector'),
      secret: z.coerce.boolean().optional().default(false).describe('Redact typed text from logs'),
      clear_first: z.coerce.boolean().optional().default(false).describe('For action="type": clear the field first (select-all + delete) so an existing value is REPLACED, not appended to - use it on pre-filled inputs and comboboxes'),
      await_conditions: z.array(z.record(z.string(), z.any())).optional().describe('wait_for conditions evaluated right after the action'),
      timeout_ms: z.coerce.number().optional().default(15000).describe('Timeout for await_conditions'),
      dry_run: z.coerce.boolean().optional().default(false).describe('Resolve the target but do not act'),
    },
    endpoint: '/act',
    endpointFor: (args) => (args?.action === 'fill' ? '/form/fill' : '/act'),
    endpoints: ['/act', '/form/fill'],
    payload: (args) => args?.action === 'fill'
      ? { fields: args?.fields, submitSelector: args?.submit_selector }
      : {
          mark_id: args?.mark_id,
          selector: args?.selector,
          target_text: args?.target_text,
          sealed_token: args?.sealed_token,
          x: args?.x,
          y: args?.y,
          action: args?.action || 'click',
          text: args?.text !== undefined ? String(args.text) : undefined,
          secret: args?.secret === true,
          clear_first: args?.clear_first === true,
          await: args?.await_conditions,
          timeout_ms: args?.timeout_ms,
          dry_run: args?.dry_run === true,
        },
    format: (data, args) => {
      if (args?.action === 'fill') return JSON.stringify(data.result ?? data, null, 2);
      const t = data.target || {};
      const where =
        t.id !== undefined
          ? `[#${t.id}] <${t.tag}> "${t.text}"`
          : t.selector
            ? `${t.tag ? `<${t.tag}> ` : ''}${t.selector}${t.text ? ` "${t.text}"` : ''}`
            : t.center
              ? `(${t.center.x}, ${t.center.y})`
              : '(nothing)';
      if (data.dryRun) return `DRY RUN — would ${data.action} ${where}${data.wouldType ? ` typing "${data.wouldType}"` : ''}`;
      if (data.action === 'press') return `press "${args?.text || 'Enter'}"`;
      const d = data.delta || {};
      const parts = [
        `${data.action} ${where}`,
        d.urlChanged ? `url: ${d.beforeUrl} -> ${d.afterUrl}` : 'url unchanged',
        `revision ${d.revisionBefore}->${d.revisionAfter}`,
        `marks ${d.marksBefore}->${d.marksAfter}`,
      ];
      if (data.awaited) parts.push(`await: ${data.awaited.ok ? 'READY' : 'TIMED OUT'} in ${data.awaited.waitedMs}ms${data.awaited.hint ? ` [${data.awaited.hint}]` : ''}`);
      return parts.join(' · ');
    },
  },
];

