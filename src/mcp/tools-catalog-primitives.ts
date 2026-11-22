import { z } from 'zod';
import type { ToolCatalogItem } from './tools-catalog-types.js';
import { formatMark } from './format-mark.js';
import { normaliseUrl, requireUrl } from './tool-args.js';
import { BRAND } from '../shared/brand.js';

/** When to use: the observe/act primitives core plus the page-state and context entries. */
export const PRIMITIVES_TOOLS: ToolCatalogItem[] = [
  // ---------------------------------------------------------------------------
  // 14. Primitives Layer — one observe / act / wait / extract model.
  // These complement the procedural verbs above; nothing is replaced.
  // ---------------------------------------------------------------------------
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
    name: 'recipe',
    description:
      'Navigation recipes: a page path compiled into descriptor steps and replayed with ZERO model calls. ' +
      'action="save" stores steps that address controls by visible text (works for semantics-free React cards and form fields) with optional expect conditions; action="replay" walks them by id, or by the best match for a url; action="list"; action="delete". ' +
      'Recipes are local (data/recipes.json), scoped to origin + path (a trailing * makes the path a prefix), and are retired after 3 consecutive failed replays — a stale path stops being retried instead of failing forever. ' +
      'A replay stops at the first step whose control cannot be resolved or whose expectation does not hold, and reports the index. Prefer this for repeat visits once a path is known; use drive/decide while it is still being discovered.',
    parameters: {
      action: z.enum(['list', 'save', 'replay', 'delete']).default('list').describe('What to do'),
      id: z.string().optional().describe('Recipe id (replay/delete)'),
      url: z.string().optional().describe('Page URL the recipe belongs to (save), or the page to match (replay/list)'),
      name: z.string().optional().describe('Human name for the recipe'),
      path: z.string().optional().describe('Path pattern instead of the URL pathname (a trailing * matches a prefix)'),
      steps: z.array(z.object({
        action: z.enum(['click', 'type']),
        target: z.string().describe('Visible text, or a form field label / placeholder / name'),
        value: z.string().optional().describe('Value for action="type"'),
        expect: z.array(z.record(z.string(), z.any())).optional().describe('wait_for conditions asserted after the step'),
      })).optional().describe('Steps to store (save)'),
      expect_timeout_ms: z.coerce.number().optional().describe('Per-step expectation timeout during replay (default 8000)'),
    },
    endpoint: '/recipes',
    payload: (args) => ({
      action: args?.action || 'list',
      id: args?.id,
      url: args?.url,
      name: args?.name,
      path: args?.path,
      steps: args?.steps,
      expect_timeout_ms: args?.expect_timeout_ms,
    }),
    format: (data) => {
      if (data.success === false) return `recipe failed: ${data.error || (data.errors || []).join('; ')}`;
      if (data.recipes) {
        if (!data.recipes.length) return 'No recipes saved.';
        return data.recipes
          .map((r: any) => `${r.id} · ${r.name} · ${r.origin}${r.path} · ${r.steps.length} step(s) · ${r.successes}/${r.attempts} ok${r.consecutiveFailures ? ` · ${r.consecutiveFailures} miss` : ''}`)
          .join('\n');
      }
      if (data.result) {
        const lines = (data.result.steps || []).map((s: any) => `${s.index + 1}. ${s.step.action} "${s.step.target}" ${s.ok ? '✓' : '✗'} ${s.ms}ms${s.error ? ` — ${s.error}` : ''}`);
        return `replay · ${data.result.status} · ${data.result.steps.length} step(s) · ${data.result.ms}ms\n${lines.join('\n')}\n${data.result.message}`;
      }
      if (data.recipe) return `saved ${data.recipe.id} · ${data.recipe.name} · ${data.recipe.steps.length} step(s)`;
      return JSON.stringify(data).slice(0, 400);
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
  {
    name: 'wait_for',
    description:
      'Declarative readiness gate. Polls until every (require="all") or any (require="any", default) condition holds, then returns. This is the primitive that replaces blind sleeps. Condition types: ' +
      '{"type":"selector","selector":"...","visible":true} · {"type":"gone","selector":"..."} · {"type":"text","text":"..."} (or {"regex":"..."}) · {"type":"url","pattern":"..."} · ' +
      '{"type":"role_name","role":"button","name":"Search"} · {"type":"count","selector":".card","min":5} · {"type":"network_idle","quietMs":800} · ' +
      '{"type":"stable","target":"marks|height|text|nodes","holdMs":400} (waits for lazily-rendered lists to stop growing) · {"type":"revision","version":N}.',
    parameters: {
      conditions: z.array(z.record(z.string(), z.any())).describe('Array of condition objects, e.g. [{"type":"selector","selector":".result"}]'),
      require: z.enum(['any', 'all']).optional().default('any').describe('"all" = every condition must hold; "any" = first one (default)'),
      timeout_ms: z.coerce.number().optional().default(15000).describe('Give up after this many ms (default: 15000)'),
      poll_ms: z.coerce.number().optional().default(120).describe('Poll interval in ms (default: 120 — sites settle in tens of ms, so 250 wastes a quarter second per wait)'),
    },
    endpoint: '/wait-for',
    payload: (args) => ({
      conditions: args?.conditions || (args?.condition ? [args.condition] : []),
      require: args?.require || 'any',
      timeout_ms: args?.timeout_ms,
      poll_ms: args?.poll_ms,
    }),
    format: (data) => {
      const lines = (data.results || []).map((r: any) => `${r.ok ? '✓' : '✗'} ${r.type}${r.evidence ? ` — ${r.evidence}` : ''}`);
      return `${data.ok ? 'READY' : 'TIMED OUT'} after ${data.waitedMs}ms (${data.attempts} polls, require=${data.require})\n${lines.join('\n')}`;
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
    name: 'page_state',
    description: 'Cheap monotonic state signature (revision, url, title, mark count, DOM node count, scroll height, text length/hash). Use with diff() to detect change without re-reading the page.',
    parameters: {},
    endpoint: '/page-state',
    method: 'POST',
    format: (data) => JSON.stringify(data.state, null, 2),
  },
  {
    name: 'diff',
    description: 'Field-by-field diff between the current page state and a previously observed revision (from page_state/observe/act). Shows exactly what changed: url, title, marks, nodeCount, height, scrollY, textLen, textHash.',
    parameters: {
      since: z.coerce.number().optional().describe('Revision to diff against (default: earliest recorded state)'),
    },
    endpoint: '/diff',
    payload: (args) => ({ since: args?.since }),
    format: (data) => {
      if (!data.changed) return `No change since revision ${data.from?.revision} (revision ${data.to?.revision}).`;
      const lines = Object.entries(data.changes || {}).map(([k, v]: any) => `${k}: ${JSON.stringify(v.from)} -> ${JSON.stringify(v.to)}`);
      return `Changed ${data.from?.revision} -> ${data.to?.revision}\n${lines.join('\n')}`;
    },
  },
  {
    name: 'bridge_health',
    description: 'Bridge + app liveness and capability discovery: version, page revision, negotiated primitives capabilities, active tab/url, window focused/visible state, the active synthetic-input transport (cdp|native), and the timestamp of the last mutating action.',
    parameters: {},
    endpoint: '/health',
    method: 'GET',
    format: (data) => JSON.stringify({ status: data.status, version: data.version, revision: data.revision, capabilities: data.capabilities, url: data.info?.url, title: data.info?.title, window: data.window, input: data.input, zoom: data.zoom, lastActionAt: data.lastActionAt }, null, 2),
  },
  {
    name: 'export_har',
    description: 'Exports captured network traffic as a HAR 1.2 log (request/response headers + body previews). Set save=true to write data/har/har_<ts>.har and get the path; otherwise the HAR JSON is returned.',
    parameters: {
      pattern: z.string().optional().describe('URL substring filter'),
      limit: z.coerce.number().optional().default(250).describe('Max entries'),
      save: z.coerce.boolean().optional().default(false).describe('Write the HAR to data/har/ and return the path instead of the JSON'),
    },
    endpoint: '/network/har',
    payload: (args) => ({ pattern: args?.pattern, limit: args?.limit, save: args?.save === true }),
    format: (data) => (data.filePath ? `HAR written to ${data.filePath} (${data.entries} entries)` : JSON.stringify(data.har)),
  },
  {
    name: 'context_save',
    description: 'Saves the current browsing context (cookies + storage) under a name — the profile abstraction for authenticated sessions.',
    parameters: { name: z.string().optional().describe('Context name (auto-generated if omitted)') },
    endpoint: '/context/save',
    payload: (args) => ({ name: args?.name }),
    format: (data) => JSON.stringify(data.result),
  },
  {
    name: 'context_open',
    description: 'Restores (switches to) a named browsing context/profile, reloading its cookies and storage.',
    parameters: { name: z.string().describe('Context name to restore') },
    endpoint: '/context/open',
    payload: (args) => ({ name: args?.name }),
    format: (data) => JSON.stringify(data.result),
  },
  {
    name: 'context_list',
    description: 'Lists saved browsing contexts (cookie/storage profiles).',
    parameters: {},
    endpoint: '/context/list',
    method: 'GET',
    format: (data) => JSON.stringify(data.contexts, null, 2),
  },
  {
    name: 'context_delete',
    description: 'Deletes a saved browsing context/profile.',
    parameters: { name: z.string().describe('Context name to delete') },
    endpoint: '/context/delete',
    payload: (args) => ({ name: args?.name }),
    format: (data) => JSON.stringify({ deleted: data.deleted }),
  },
];

