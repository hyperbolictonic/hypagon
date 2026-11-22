import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';

/** When to use: the catalog segment fronting URL-to-Markdown, multi-engine search, crawling and cited topic research. */
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
    name: 'prerender_links',
    description: 'Speculative Pre-rendering Engine. Pre-executes, hydrates, and caches candidate links in background views so subsequent navigation is 0ms instantaneous. Automatically distills and indexes content into LanceDB Cortex memory.',
    parameters: {
      urls: z.array(z.string()).optional().describe('Specific candidate URLs to prerender. If omitted, uses selector or page link heuristics'),
      selector: z.string().optional().describe('CSS selector to pick candidate links from the active page (e.g. "a.search-result", ".docs-nav a")'),
      max_pages: z.coerce.number().optional().default(3).describe('Maximum candidate pages to prerender in background pool (max: 3)'),
      harvest_to_cortex: z.coerce.boolean().optional().default(true).describe('Whether to automatically distill and index pre-rendered pages into LanceDB Cortex memory for instant recall_memory'),
      wait_until_idle_ms: z.coerce.number().optional().default(500).describe('Hydration wait time per candidate view'),
    },
    endpoint: '/prerender/links',
    payload: (args) => ({
      urls: args?.urls,
      selector: args?.selector,
      maxPages: args?.max_pages !== undefined ? Number(args.max_pages) : 3,
      harvestToCortex: args?.harvest_to_cortex !== undefined ? Boolean(args.harvest_to_cortex) : true,
      waitUntilIdleMs: args?.wait_until_idle_ms !== undefined ? Number(args.wait_until_idle_ms) : 500,
    }),
    format: (data) => {
      const list = Array.isArray(data.prerendered) ? data.prerendered : [];
      if (list.length === 0) return 'No candidate links were pre-rendered.';
      const lines = list.map((u: string) => `- [0ms READY] ${u}`);
      return `### Speculative Pre-rendered Pool (${list.length} pages warm & indexed to Cortex)\nSubsequent navigate_to() calls targeting these URLs will load with 0ms perceived latency.\n\n${lines.join('\n')}`;
    },
  },
];
