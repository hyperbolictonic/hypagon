import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { collectFormat, collectPayload } from './tools-catalog-fields.js';

/** When to use: the catalog segment fronting reading and harvesting the page, the JEV compaction surface and the decision-model loop. */
export const OBSERVE_TOOLS: ToolCatalogItem[] = [
{
    name: 'get_page_markdown',
    hidden: true,
    deprecatedInFavorOf: 'observe',
    description: 'Deprecated alias for observe(as:"markdown"). Extracts the active page DOM converted to token-efficient Markdown with YAML frontmatter envelope (title, URL, timestamps). By default includes Set-of-Marks badges ([#1], [#2]...) directly on interactive elements (links, buttons, inputs) so you can call act(id) or act(id, action:"type", text) directly from the text without taking screenshots!',
    parameters: {
      include_marks: z.coerce.boolean().optional().default(true).describe('Whether to annotate interactive elements with [#ID] Set-of-Marks badges (default: true)'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also annotate interactive elements outside the current viewport so their [#ID] badges appear in the markdown (use for long/virtualized result lists; default: false)'),
    },
    endpoint: '/markdown',
    method: 'GET',
    payload: (args) => {
      const includeMarks = args?.include_marks !== false && args?.marks !== false;
      const includeOffscreen = args?.include_offscreen === true;
      return { queryParams: { include_marks: String(includeMarks), include_offscreen: String(includeOffscreen) } };
    },
    format: (data) => { const md = data.construct?.content || data.construct?.markdown || JSON.stringify(data, null, 2); return md.length > 25000 ? md.slice(0, 25000) + "\n\n... [Output truncated to 25000 chars]" : md; },
  },
{
    name: 'harvest_markdown',
    hidden: true,
    deprecatedInFavorOf: 'observe',
    description: 'Deprecated alias for get_page_markdown. Extracts clean markdown with inline [#ID] marks from the active tab.',
    parameters: {
      include_marks: z.coerce.boolean().optional().default(true).describe('Whether to annotate interactive elements with [#ID] Set-of-Marks badges (default: true)'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Also annotate interactive elements outside the current viewport (use for long/virtualized result lists; default: false)'),
    },
    endpoint: '/markdown',
    method: 'GET',
    payload: (args) => {
      const includeMarks = args?.include_marks !== false && args?.marks !== false;
      const includeOffscreen = args?.include_offscreen === true;
      return { queryParams: { include_marks: String(includeMarks), include_offscreen: String(includeOffscreen) } };
    },
    format: (data) => { const md = data.construct?.content || data.construct?.markdown || JSON.stringify(data, null, 2); return md.length > 25000 ? md.slice(0, 25000) + "\n\n... [Output truncated to 25000 chars]" : md; },
  },
{
    name: 'jev_index',
    description:
      'Just-Enough-View (JEV) surface index for the active page: a compact map of sections with IDs, headings, token weights and one-line summaries instead of a full markdown dump (~95% smaller). Follow with read_section(section_id) to fetch only what is needed, or search_page(query) to locate text without expanding. Requires a configured decision model and the optional JEV setting.',
    parameters: {},
    endpoint: '/jev/index',
    method: 'GET',
    format: (data) => (data?.ok ? data.index : data?.error || 'JEV unavailable'),
  },
{
    name: 'read_section',
    description: 'Fetch the complete Markdown body for a section ID from the current JEV page index (e.g. "sec_1.1"). Set include_children=true to pull nested subsections too.',
    parameters: {
      section_id: z.string().describe('Section ID from jev_index, e.g. "sec_2" or "sec_1.1"'),
      include_children: z.coerce.boolean().optional().default(false).describe('Also return nested subsections (default: false)'),
    },
    endpoint: '/jev/read',
    method: 'POST',
    payload: (args) => ({ section_id: args?.section_id ?? args?.sectionId ?? '', include_children: args?.include_children === true }),
    format: (data) => {
      if (!data?.ok) return data?.error || 'Section unavailable';
      const folded = (data.folded || []).join('\n');
      return `${data.content}${folded ? `\n\n---\nAuto-fold hint:\n${folded}` : ''}`;
    },
  },
{
    name: 'search_page',
    description: 'Run a fast keyword/regex query over all folded JEV section text without expanding it. Returns matching section IDs, counts and snippets; then call read_section for context.',
    parameters: {
      query: z.string().describe('Keyword or regular expression to find across the page'),
    },
    endpoint: '/jev/search',
    method: 'POST',
    payload: (args) => ({ query: args?.query ?? args?.text ?? '' }),
    format: (data) => {
      if (!data?.ok) return data?.error || 'Search unavailable';
      const hits = Array.isArray(data.hits) ? data.hits : [];
      if (!hits.length) return 'No matches.';
      return hits.map((hit: { section_id: string; heading: string; matches: number; snippet: string }) => `- [${hit.section_id}] ${hit.heading} (${hit.matches} match${hit.matches === 1 ? '' : 'es'}) — ${hit.snippet}`).join('\n');
    },
  },
{
    name: 'observe',
    description:
      'One budgeted observation model with projections. as="markdown" (TIER 1 readable construct with inline [#id] marks) · as="text" (innerText, region-scoped) · as="ax" (accessibility tree) · as="som" (numbered marks table) · as="components" (decision-ready table: role, name, value, state, affordances and region per component). ' +
      'Markdown returns a 25,000-char default view - page it with budget + next_cursor, or pass budget=0 for the whole construct. The front-matter reports reader, extracted_chars and page_chars (how much of the page text the readable region covers) plus shadow_roots, so a genuinely short page can be told apart from a partly-visible one. region accepts a mark id (number) or CSS selector. For structured list/table/app-data extraction use `extract`. ' +
      'When a decision model is configured, as="components" is the intended input to `decide`: observe -> decide -> act(mark_id), instead of hand-scanning the mark list on a busy page.',
    parameters: {
      as: z.enum(['markdown', 'text', 'ax', 'som', 'components']).optional().default('markdown').describe('Projection to return (default: markdown)'),
      region: z.union([z.coerce.number(), z.string()]).optional().describe('Scope to a mark id (number) or CSS selector (string)'),
      budget: z.coerce.number().optional().describe('Max characters to return; page with next_cursor. Omitted = the projection default (markdown 25,000, text/ax everything); 0 = everything'),
      cursor: z.union([z.string(), z.coerce.number()]).optional().describe('next_cursor from a previous observe call'),
      include_offscreen: z.coerce.boolean().optional().default(false).describe('Include below/above-the-fold elements (markdown marks, som, list)'),
      include_frames: z.coerce.boolean().optional().default(false).describe('Merge child-frame controls into som/components (100+ mark ids)'),
      limit: z.coerce.number().optional().describe('Max rows for list/table projections'),
      full: z.coerce.boolean().optional().default(false).describe('JEV bypass: force a full unscoped read even when JEV enforce is on (logged). Prefer jev_index/read_section.'),
    },
    endpoint: '/observe',
    payload: (args) => ({
      as: args?.as || 'markdown',
      region: args?.region,
      budget: args?.budget,
      cursor: args?.cursor,
      include_offscreen: args?.include_offscreen === true,
      include_frames: args?.include_frames === true,
      limit: args?.limit,
      full: args?.full === true,
    }),
    format: (data) => {
      const chars = data.text ? data.text.length : 0;
      const facts = [data.truncated ? `chars=${chars} of ${data.total ?? 0}` : `chars=${chars}`];
      if (data.tokens) facts.push(`~${data.tokens} tokens`);
      if (data.shadowRoots) facts.push(`${data.shadowRoots} shadow root${data.shadowRoots === 1 ? '' : 's'}`);
      if (data.truncated) facts.push(`next_cursor=${data.next_cursor}`);
      const head = `observe(as=${data.as})${data.url ? ` · ${data.url}` : ''}`;
      return `${head}\n${facts.join(' · ')}\n\n${data.text || '(no content)'}`;
    },
  },
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
      ? { kind: 'collect', ...collectPayload(args) }
      : { kind: args?.kind || 'list', ref: args?.ref, selector: args?.selector, type: args?.type, limit: args?.limit, include_frames: args?.include_frames, max_frames: args?.max_frames, timeout_ms: args?.timeout_ms },
    format: (data, args) => {
      if (args?.kind === 'collect') {
        return collectFormat(data, { label: 'extract(collect)', heading: '# extract(collect) -' });
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
    name: 'snapshot_rendered_page',
    description: 'Captures a post-hydration, rendered point-in-time snapshot of dynamic, JavaScript-heavy pages (React, Next.js, Vue). Freezes live state, pierces Shadow DOM, and extracts ultra-token-efficient Accessibility (AX) Trees or rendered Markdown.',
    parameters: {
      format: z.enum(['ax_tree', 'markdown', 'html', 'unrendered_html']).optional().default('ax_tree').describe('Snapshot format: "ax_tree" (recommended: semantic roles, labels, and states with zero cosmetic div noise), "markdown" (computed DOM markdown with live values), "html" (rendered static HTML), or "unrendered_html" (raw pre-mutation HTML source)'),
      wait_until_idle_ms: z.coerce.number().optional().default(400).describe('Time in ms to wait for pending network microtasks and React state updates to settle (default: 400)'),
      pierce_shadow_dom: z.coerce.boolean().optional().default(true).describe('Whether to traverse and unwrap encapsulated Shadow Roots (#shadow-root)'),
      save_to_disk: z.coerce.boolean().optional().default(false).describe('Whether to persist snapshot to data/snapshots/ for offline re-inspection via query_json_data'),
      force_rerender: z.coerce.boolean().optional().default(false).describe('Whether to force reflow and dispatch resize events to trigger re-renders before snapshotting'),
    },
    endpoint: '/snapshot/rendered',
    payload: (args) => ({
      format: args?.format || 'ax_tree',
      waitUntilIdleMs: args?.wait_until_idle_ms !== undefined ? Number(args.wait_until_idle_ms) : 400,
      pierceShadowDom: args?.pierce_shadow_dom !== undefined ? Boolean(args.pierce_shadow_dom) : true,
      saveToDisk: args?.save_to_disk !== undefined ? Boolean(args.save_to_disk) : false,
      forceRerender: args?.force_rerender !== undefined ? Boolean(args.force_rerender) : false,
    }),
    format: (data) => {
      const stats = data.stats || {};
      const fileNotice = data.filePath ? ` (Saved to: ${data.filePath})` : '';
      const header = `### Rendered Page Snapshot [${data.format?.toUpperCase()}] — "${data.title}" (${stats.estimatedTokens || 0} est tokens, ${stats.byteLength || 0} bytes)${fileNotice}\nURL: ${data.url}\n\n`;
      return `${header}${data.content || 'Snapshot empty'}`;
    },
  },
{
    name: 'drive',
    description:
      'OPTIONAL goal-driven UI loop (absent unless a decision model is configured). Repeats observe(as:"components") → decide → act until the goal is reached or a stop condition fires, with one decision call per step instead of an agent turn per step. ' +
      'Text is never generated: pass `values` keyed by field name (or component id); if the next step needs a value you have not supplied, it stops with status "needs_input", names the field, and you call again with the value. ' +
      'Stops on: done · blocked (no deterministic gate matched, so YOU decide) · human_required (age/CAPTCHA; the hand-off is raised) · needs_agent (no acceptable action, or a contradiction the guard rejected) · failed · max_steps. ' +
      'Every step is in `steps` (operation, target, chars typed, warning). Use dry_run to see the first planned step without acting. Prefer this over hand-scripting long forms; use `decide` directly when you want to choose each step yourself.',
    parameters: {
      goal: z.string().describe('What to accomplish, in one sentence (e.g. "search London → Maldives, 1–7 Nov, cheapest")'),
      values: z.record(z.string(), z.string()).optional().describe('Text to type, keyed by field name or component id (case-insensitive, contains-matching)'),
      max_steps: z.coerce.number().min(1).max(25).optional().default(10).describe('Stop after this many actions (default 10)'),
      threshold: z.coerce.number().min(0).max(1).optional().describe('Minimum confidence to accept a decision (default 0.45)'),
      dry_run: z.coerce.boolean().optional().default(false).describe('Plan the first step and return without acting'),
      save_recipe: z.coerce.boolean().optional().default(false).describe('On a successful run, compile the verified steps into a replayable recipe (see the `recipe` tool)'),
      recipe_name: z.string().optional().describe('Name for the saved recipe (defaults to the goal)'),
    },
    endpoint: '/drive',
    payload: (args) => ({
      goal: args?.goal,
      values: args?.values,
      max_steps: args?.max_steps,
      threshold: args?.threshold,
      dry_run: args?.dry_run,
      save_recipe: args?.save_recipe === true,
      recipe_name: args?.recipe_name,
    }),
    format: (data) => {
      if (data.error) return `drive failed: ${data.error}`;
      const lines = (data.steps || []).map((s: any) =>
        `${s.step}. ${s.operation} #${s.target} "${(s.targetName || '').slice(0, 40)}"${s.typedChars ? ` (${s.typedChars} chars)` : ''} ${s.ok ? '✓' : '✗'}${s.urlChanged ? ' → navigated' : ''}${s.warning ? ` ⚠ ${s.warning.slice(0, 80)}` : ''}`
      );
      const head = `drive · ${data.status} · ${(data.steps || []).length} step(s) · ${data.durationMs ?? '?'}ms`;
      const tail = data.field ? `\nNeeds value for: #${data.field.id} "${data.field.name}"` : '';
      return `${head}\n${lines.join('\n')}${lines.length ? '\n' : ''}${data.message || ''}${tail}`;
    },
  },
{
    name: 'decide',
    description:
      'OPTIONAL decision model (absent unless configured — see docs/DECISION_MODELS.md). Send a state plus typed questions; get typed answers back: choices with probabilities, scores, yes/no — never prose. ' +
      'This is not an LLM: every answer is one of the options you supplied, so it cannot invent a target. The gateway forwards your questions verbatim and returns the answers untouched, and never calls a decision model on its own. ' +
      'Typical loop: observe(as:"components") for the component table (role/name/value/region/actions, ids are mark ids) → decide over it (e.g. one `choice` for the operation, one `choice` per operation over only the components whose actions include it, all in ONE call) → act(mark_id) → check the returned delta/typing verdict. ' +
      'FAN OUT THE HEADS: ask operation + every plausible target head (click_target, type_text_target, select_target) + done in the same call, then execute only the head matching the chosen operation — one round trip per step instead of operation-then-target. Ask only for heads the page offers. ' +
      'Backends: hosted Jev (typesafe protocol, e.g. jev-1.13) or a local ONNX model via open-jev (local-onnx: kev-0.6b by default — experimental, see docs/DECISION_MODELS.md for measured accuracy). Returns NOT_CONFIGURED when no backend is set.',
    parameters: {
      state: z.any().describe('What the model reasons over: a string, JSON (e.g. the components array), or an array of values'),
      questions: z.record(z.string(), z.any()).describe('Typed questions keyed by name. For TypeSafe: {"operation":{"type":"choice","instructions":"…","criteria":{"click":"Click a control","done":"The goal is met"}},"done":{"type":"noul","instructions":"…"}} — choice takes criteria (option→description), NOT options. Local open-jev takes options instead.'),
      model: z.string().optional().describe('Override the configured model for this call (e.g. "jev-1.13", "d1-3b")'),
      guard: z.object({
        threshold: z.coerce.number().min(0).max(1).optional().describe('Reject choices below this confidence (0–1)'),
        operations: z.array(z.string()).optional().describe('Operations that may be accepted (default click/type_text/done/blocked)'),
        components: z.array(z.object({ id: z.union([z.string(), z.coerce.number()]), actions: z.array(z.string()).optional(), name: z.string().optional() })).optional().describe('The components you offered (from observe as=components) — a target not in this list, or one that does not accept the operation, is rejected'),
      }).optional().describe('Validate the answer before trusting it: confidence gate, target membership, affordance match, done/operation contradiction'),
      eliminate: z.object({
        max_attempts: z.coerce.number().min(1).max(5).optional().describe('Total model calls including the first (default 3 when eliminate is set)'),
      }).optional().describe('Drop a rejected option and ask again with the rest; when everything is eliminated the result is accepted:false, fallback:"agent"'),
      include_page_text: z.coerce.boolean().optional().describe('Append the live page text to the state before asking (default: on for guarded calls). Needed for sensitive-gate detection, whose copy lives in the page, not the component table'),
      include_screenshot: z.coerce.boolean().optional().describe('Attach a JPEG of the visible viewport to the state. Hosted Jev only, and NOT through the OpenCode gateway (it does not forward the required TypeSafe header) — with opencode.ai the image is skipped and the result says so. Works against api.typesafe.ai.'),
    },
    endpoint: '/decide',
    payload: (args) => ({
      state: args?.state,
      questions: args?.questions || {},
      model: args?.model,
      guard: args?.guard,
      eliminate: args?.eliminate,
      include_page_text: args?.include_page_text,
      include_screenshot: args?.include_screenshot,
    }),
    format: (data) => {
      if (data.error) return `decide failed: ${data.error}`;
      if (data.accepted === false) {
        const reasons = (data.reasons || []).join('\n');
        return `NO DECISION — the agent decides (${data.attempts} attempt${data.attempts === 1 ? '' : 's'})\n${reasons}`;
      }
      const answers = data.answers || {};
      const lines = Object.entries(answers).map(([key, value]) => {
        if (value && typeof value === 'object') {
          const v: any = value;
          const bits = [`${key}: ${v.choice ?? v.score ?? v.noul ?? '?'}`];
          if (value && 'confidence' in v) bits.push(`confidence=${v.confidence}`);
          if (v.probabilities) bits.push(`p=${JSON.stringify(v.probabilities)}`);
          return bits.join(' · ');
        }
        return `${key}: ${value}`;
      });
      const attempts = data.attempts > 1 ? ` · ${data.attempts} attempts` : '';
      const hint = data.hint ? `\n\n${data.hint}` : '';
      return `${data.protocol || 'decision'}(${data.model || '?'}) ${data.latencyMs ?? '?'}ms${attempts}\n${lines.join('\n')}${hint}`;
    },
  },
];
