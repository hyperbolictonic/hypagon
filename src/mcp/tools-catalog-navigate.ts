import { z } from 'zod';
import { normaliseUrl, requireUrl } from './tool-args.js';
import type { ToolCatalogItem } from './tools-catalog-types.js';

/** When to use: the catalog segment fronting page navigation, history, page status and devtools checks. */
export const NAVIGATE_TOOLS: ToolCatalogItem[] = [
{
    name: 'navigate_to',
    description: 'Navigates the real, visible Chromium browser window to a destination URL. Automatically dismisses GDPR/cookie consent overlays by default.',
    parameters: {
      url: z.string().describe('The destination URL (e.g. "https://news.ycombinator.com" or "https://www.skyscanner.net")'),
      auto_dismiss_consent: z.boolean().optional().default(true).describe('Whether to automatically detect and dismiss cookie/GDPR consent overlays (default: true)'),
    },
    endpoint: '/navigate',
    payload: (args) => ({ url: requireUrl(args), autoDismissConsent: args?.auto_dismiss_consent ?? true }),
    format: (data) => data.result || 'Navigation complete',
  },
{
    name: 'go_to_url',
    hidden: true,
    deprecatedInFavorOf: 'navigate_to',
    description: 'Deprecated alias for navigate_to. Navigates the browser window to a destination URL.',
    parameters: {
      url: z.string().describe('The destination URL (e.g. "https://www.skyscanner.net")'),
    },
    endpoint: '/navigate',
    payload: (args) => ({ url: requireUrl(args) }),
    format: (data) => data.result || 'Navigation complete',
  },
{
    name: 'navigate_history',
    description: 'Navigates back or forward in the browser history.',
    parameters: {
      direction: z.enum(['back', 'forward']).describe('Navigation direction: "back" or "forward"'),
    },
    endpoint: '/history',
    payload: (args) => ({ action: args.direction }),
    format: (data, args) => data.result || `Navigated ${args.direction}`,
  },
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
    name: 'scroll_page',
    description: 'Simulates organic inertial wheel scrolling in the active viewport.',
    parameters: {
      direction: z.enum(['up', 'down', 'top', 'bottom']).optional().default('down').describe('Scroll direction (default: "down")'),
      amount: z.number().optional().default(400).describe('Scroll amount in pixels (default: 400)'),
    },
    endpoint: '/scroll',
    payload: (args) => ({ direction: args?.direction || 'down', amount: args?.amount !== undefined ? Number(args.amount) : 400 }),
    format: (data) => data.result || 'Scrolled successfully',
  },
{
    name: 'get_page_info',
    hidden: true,
    deprecatedInFavorOf: 'bridge_health',
    description: 'Deprecated alias for bridge_health() + page_state(). Returns the current URL, page title, navigation status, tab count, and active tab ID of the browser window.',
    parameters: {},
    endpoint: '/page-info',
    method: 'GET',
    format: (data) => JSON.stringify(data.info, null, 2),
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
    name: 'get_console_logs',
    description: 'Returns the recent console logs (log, warn, error, info) emitted by the active web page.',
    parameters: {
      limit: z.number().optional().default(50).describe('Max entries to return (default: 50)'),
    },
    endpoint: '/console/logs',
    method: 'GET',
    payload: (args) => ({ queryParams: { limit: String(args?.limit ?? 50) } }),
    format: (data) => {
      const logs = Array.isArray(data.logs) ? data.logs : [];
      if (logs.length === 0) return 'No console logs captured.';
      const lines = logs.map((l: any) => {
        const time = l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : '';
        const level = (l.level || 'info').toUpperCase().padEnd(5);
        return `[${time}] ${level} ${l.message || ''}`;
      });
      return `### Console Logs (${logs.length})\n${lines.join('\n')}`;
    },
  },
{
    name: 'get_fingerprint_profile',
    description: 'Inspects the active hardware spoofing profile (User-Agent, Platform, Screen, WebGL, Audio).',
    parameters: {},
    endpoint: '/fingerprint',
    method: 'GET',
    format: (data) => JSON.stringify(data.profile, null, 2),
  },
];
