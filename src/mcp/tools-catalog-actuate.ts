import { z } from 'zod';
import { formatMark } from './format-mark.js';
import type { ToolCatalogItem } from './tools-catalog-types.js';

/** When to use: the catalog segment fronting input actuation primitives: clicks, typing, keys, forms, waits and shadow walks. */
export const ACTUATE_TOOLS: ToolCatalogItem[] = [
{
    name: 'click_element',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Clicks an element on the active web page using a CSS selector or direct viewport coordinates (x, y). Simulates realistic human pointer movement and switch actuation.',
    parameters: {
      selector: z.string().optional().describe('CSS selector of the element to click (e.g. "button.submit", "a[href*=\'login\']", "#search-input")'),
      x: z.coerce.number().optional().describe('Direct X coordinate on the viewport in pixels'),
      y: z.coerce.number().optional().describe('Direct Y coordinate on the viewport in pixels'),
    },
    endpoint: '/click',
    payload: (args) => {
      const selector = args?.selector || args?.element || args?.target || args?.css || args?.query;
      const x = args?.x !== undefined ? Number(args.x) : undefined;
      const y = args?.y !== undefined ? Number(args.y) : undefined;
      if (!selector && (x === undefined || y === undefined)) {
        throw new Error('Missing click target. Please provide either a "selector" (CSS selector) or ("x", "y") viewport coordinates.');
      }
      return { selector, x, y };
    },
    format: (data) => data.result || 'Click executed',
  },
{
    name: 'type_text',
    hidden: true,
    deprecatedInFavorOf: 'act',
    description: 'Types text into an input element or active element with realistic human Gaussian typing cadence (60-240ms per keystroke).',
    parameters: {
      text: z.string().describe('The text string to type (e.g. "London")'),
      selector: z.string().optional().describe('Optional CSS selector of the input element'),
    },
    endpoint: '/type',
    payload: (args) => {
      const text = args?.text !== undefined ? String(args.text) : (args?.value !== undefined ? String(args.value) : (args?.content !== undefined ? String(args.content) : (args?.input !== undefined ? String(args.input) : '')));
      const selector = args?.selector || args?.element || args?.target || args?.css;
      return { text, selector };
    },
    format: (data) => data.result || 'Text typed successfully',
  },
{
    name: 'press_key',
    description: 'Dispatches a single hardware keyboard event (Enter, Tab, Escape, Backspace, ArrowDown, etc.).',
    parameters: {
      key: z.string().describe('The key name to press (e.g. "Enter", "Tab", "Escape", "Backspace")'),
    },
    endpoint: '/press-key',
    payload: (args) => {
      const key = args?.key || args?.key_name || args?.button || 'Enter';
      return { key };
    },
    format: (data) => data.result || 'Key pressed',
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
    name: 'evaluate_javascript',
    description: 'Executes a JavaScript expression or script in the active page context and returns the serialized result. A powerful tool that can read AND mutate the page — reach for it deliberately: observe/extract cover most reads and act covers clicks and typing, and heavy injected JS is a bot-detection signal.',
    parameters: {
      script: z.string().describe('JavaScript code to evaluate in the page context (e.g. "document.title" or "1+1")'),
    },
    endpoint: '/evaluate',
    payload: (args) => {
      const script = args?.script || args?.code || args?.js || args?.expression || args?.javascript || '';
      if (!script) {
        throw new Error('Missing script to evaluate. Please provide { "script": "..." }');
      }
      return { script };
    },
    format: (data) => JSON.stringify(data.result, null, 2),
  },
];
