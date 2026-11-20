/**
 * Primitives Layer — one observe / act / wait / extract model. (part 2 of 5)
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const PRIMITIVES_2_TOOLS: ToolCatalogItem[] = [
  {
    name: 'extract',
    description:
      'Structured, read-only extraction (no page JS injection). kind="list" finds the repeating item container and returns deduped rows {text, href, aria, mark}. ' +
      'kind="table" returns {headers, rows, records} from one <table> or ARIA grid; kind="tables" returns EVERY table on the page. ' +
      'kind="schema_org" parses <script type="application/ld+json"> into typed items (flattens @graph; pass `type` to keep just e.g. "Recipe"/"Product"/"FAQPage"/"HowTo"). ' +
      'kind="app_data" returns embedded JSON from __NEXT_DATA__ / JSON-LD / inline state blobs. ' +
      'kind="collect" scrolls a lazy/virtualized list to the end and returns every distinct row.',
    parameters: {
      kind: z.enum(['list', 'table', 'tables', 'app_data', 'schema_org', 'collect']).default('list').describe('Extraction kind'),
      ref: z.coerce.number().optional().describe('Scope to a mark id (from list_marks/find)'),
      selector: z.string().optional().describe('Scope to a CSS selector (default: whole page)'),
      type: z.string().optional().describe('schema_org only: filter to one schema.org @type (e.g. "Recipe")'),
      limit: z.coerce.number().optional().default(200).describe('Max rows/sources/items'),
      include_frames: z.coerce.boolean().optional().default(false).describe('Also extract from child frames; returns per-frame results'),
      max_frames: z.coerce.number().optional().describe('Child frames to visit (default 6)'),
      timeout_ms: z.coerce.number().optional().describe('Per-frame extraction timeout (default 2000)'),
      scroll: z.enum(['container', 'window']).optional().describe('collect only: scroll target'),
      step: z.coerce.number().optional().describe('collect only: pixels per step'),
      delay_ms: z.coerce.number().optional().describe('collect only: wait after each scroll'),
      max_scrolls: z.coerce.number().optional().describe('collect only: scroll safety cap'),
      max: z.coerce.number().optional().describe('collect only: max rows'),
    },
    endpoint: '/extract',
    endpointFor: (args) => (args?.kind === 'collect' ? '/collect' : '/extract'),
    endpoints: ['/extract', '/collect'],
    payload: (args) => args?.kind === 'collect'
      ? { kind: 'collect', selector: args?.selector, ref: args?.ref, scroll: args?.scroll || 'container', step: args?.step, delay_ms: args?.delay_ms, max_scrolls: args?.max_scrolls, max: args?.max }
      : { kind: args?.kind || 'list', ref: args?.ref, selector: args?.selector, type: args?.type, limit: args?.limit, include_frames: args?.include_frames, max_frames: args?.max_frames, timeout_ms: args?.timeout_ms },
    format: (data, args) => {
      if (args?.kind === 'collect') {
        if (data.error) return `extract(collect) failed: ${data.error}`;
        const rows = (data.rows || []).map((r: any, i: number) => `${i + 1}. ${r.text}${r.href ? ` -> ${r.href}` : ''}`);
        return `# extract(collect) - ${data.count} distinct rows after ${data.scrolls} scrolls\n${rows.join('\n')}`;
      }
      const frameSummary = Array.isArray(data.frames) && data.frames.length
        ? `\n\n# child frames (${data.frames.length})\n${data.frames.map((f: any) => {
            if (!f.ok) return `- ${f.url || f.frameId}: ${f.error || 'failed'}`;
            const value = f.value || {};
            if (value.kind === 'table') return `- ${f.url || f.frameId}: ${value.count ?? (value.rows || []).length} rows`;
            if (value.kind === 'tables') return `- ${f.url || f.frameId}: ${(value.tables || []).length} tables`;
            if (value.kind === 'schema_org') return `- ${f.url || f.frameId}: ${value.count ?? (value.items || []).length} items`;
            if (value.kind === 'app_data') return `- ${f.url || f.frameId}: ${value.count ?? (value.sources || []).length} sources`;
            return `- ${f.url || f.frameId}: ${value.count ?? (value.rows || []).length} rows`;
          }).join('\n')}`
        : '';
      if (data.error) return `extract failed: ${data.error}${frameSummary}`;
      if (data.kind === 'table') {
        const head = (data.headers || []).join(' | ');
        const rows = (data.rows || []).map((r: any[]) => r.join(' | ')).join('\n');
        return `# table (${data.count} rows)\n${head}\n${rows}${frameSummary}`;
      }
      if (data.kind === 'tables') {
        const tables = data.tables || [];
        if (!tables.length) return `No <table>/ARIA grid found on the page.${frameSummary}`;
        return tables
          .map((t: any) => `# table ${t.index} (${t.count} rows)\n${(t.headers || []).join(' | ')}\n${(t.records || []).map((r: any) => Object.values(r).join(' | ')).join('\n')}`)
          .join('\n\n') + frameSummary;
      }
      if (data.kind === 'schema_org') {
        const items = data.items || [];
        const types = (data.types || []).join(', ') || 'n/a';
        if (!items.length) return `No JSON-LD (schema.org) items matched (types present: ${types}).${frameSummary}`;
        const lines = items.map((it: any, i: number) => `${i + 1}. **${it.type}**${it.types?.length > 1 ? ` (${it.types.join('+')})` : ''}: ${JSON.stringify(it.data).slice(0, 600)}`);
        return `# schema_org (${data.count}/${data.total} items; types: ${types})\n${lines.join('\n')}${frameSummary}`;
      }
      if (data.kind === 'app_data') {
        return `# app_data (${data.count} sources)\n` + (data.sources || []).map((s: any) => `${s.source} (${s.bytes}B, parsed=${s.parsed})`).join('\n') + frameSummary;
      }
      const rows = (data.rows || []).map((r: any, i: number) => `${i + 1}. ${r.text}${r.href ? ` -> ${r.href}` : ''}${r.mark ? ` [#${r.mark}]` : ''}`);
      return `# list (${data.count} items${data.container?.sig ? `, container="${data.container.sig}"` : ''})\n${rows.join('\n')}${frameSummary}`;
    },
  },
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
];
