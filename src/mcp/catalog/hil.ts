/**
 * Human-In-The-Loop (HIL) Intervention & Desktop Notifications
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import { BRAND } from '../../shared/brand.js';
import type { ToolCatalogItem } from './shared.js';
import { jsonPretty } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const HIL_TOOLS: ToolCatalogItem[] = [
  {
    name: 'request_human_intervention',
    description: 'PROACTIVELY call this whenever encountering CAPTCHAs, Cloudflare Turnstile, login/2FA prompts, payment checkouts, or unexpected roadblocks. Halts agent execution, raises a critical toast and flashes the taskbar, and swaps the Command Deck into its hand-off panel. It does NOT steal focus: the window is unhidden but the person switches to it when ready. Clicking the toast itself does focus the window.',
    parameters: {
      reason: z.string().describe('Clear explanation of what human action is needed (e.g. "Please solve the Cloudflare Turnstile challenge" or "Please enter 2FA code")'),
      timeout_seconds: z.number().optional().describe('Max seconds to wait for human action (default: 180)'),
      bring_to_front: z.boolean().optional().default(true).describe('Whether to unhide/raise the deck from the tray (without taking keyboard focus) when the request starts (default: true)'),
    },
    endpoint: '/hil/request',
    payload: (args) => {
      const reason = args?.reason || args?.message || args?.prompt || 'Human assistance requested by AI agent.';
      const timeoutSeconds = args?.timeout_seconds !== undefined ? Number(args.timeout_seconds) : undefined;
      const bringToFront = args?.bring_to_front ?? true;
      return { reason, timeoutSeconds, bringToFront };
    },
    format: (data) => JSON.stringify(data.result, null, 2),
  },
  {
    name: 'resolve_human_intervention',
    description: 'Resolves an active human intervention request, unpausing the agent.',
    parameters: {
      id: z.string().optional().describe('Specific intervention ID'),
      notes: z.string().optional().describe('Confirmation notes or summary of action taken'),
    },
    endpoint: '/hil/resolve',
    payload: (args) => ({ id: args?.id, notes: args?.notes }),
    format: (data, args) => (data.resolved ? `Intervention resolved: ${args?.notes || 'User confirmed.'}` : 'No pending intervention request found.'),
  },
  {
    name: 'get_human_intervention_status',
    description: 'Inspects pending Human-In-The-Loop (HIL) requests. This is distinct from explicit human control; use get_human_activity for that.',
    parameters: {},
    endpoint: '/hil/active',
    method: 'GET',
    format: jsonPretty,
  },
  {
    name: 'get_human_activity',
    description: 'Reports explicit human control: whether a person has pressed TAKE OVER and is blocking synthetic input (HUMAN_CONTROL / HUMAN_IN_PROGRESS), how long, and the last human page event. Page input alone no longer pauses the agent.',
    parameters: {},
    endpoint: '/human/status',
    method: 'GET',
    format: jsonPretty,
  },
  {
    name: 'send_notification',
    description: 'Dispatches an OS native desktop notification to alert the user without blocking agent execution.',
    parameters: {
      message: z.string().describe('Notification body message'),
      title: z.string().optional().default(BRAND.product).describe('Notification title'),
      urgency: z.enum(['normal', 'critical', 'low']).optional().default('normal').describe('Urgency level (default: normal)'),
      sound: z.boolean().optional().default(true).describe('Whether to play notification alert sound (default: true)'),
    },
    endpoint: '/notify',
    payload: (args) => {
      const title = args?.title || BRAND.product;
      const message = args?.message || args?.text || args?.body || 'Agent notification';
      return { title, message, urgency: args?.urgency, sound: args?.sound };
    },
    format: (data, args) => JSON.stringify({ success: data.sent, title: args?.title || BRAND.product, message: args?.message || 'Notification sent' }),
  },
  {
    name: 'send_desktop_notification',
    hidden: true,
    deprecatedInFavorOf: 'send_notification',
    description: 'Deprecated alias for send_notification (same /notify endpoint; defaults urgency=critical). Triggers a native desktop notification to summon the human operator for Human-in-the-Loop (HIL) assistance (e.g. 2FA code, SMS prompt, CAPTCHA override, or manual login).',
    parameters: {
      message: z.string().describe('Specific reason why the user is needed and instructions for what to do in the browser.'),
      title: z.string().optional().default(`${BRAND.browser}: Human Intervention Required`).describe('Notification title'),
      urgency: z.enum(['low', 'normal', 'critical']).optional().default('critical').describe('Urgency level of the notification.'),
      sound: z.boolean().optional().default(true).describe('Whether to play notification alert sound (default: true)'),
    },
    endpoint: '/notify',
    payload: (args) => {
      const title = args?.title || `${BRAND.browser}: Human Intervention Required`;
      const message = args?.message || args?.text || args?.body || `Human intervention required in ${BRAND.browser}`;
      return { title, message, urgency: args?.urgency || 'critical', sound: args?.sound ?? true };
    },
    format: (data, args) => JSON.stringify({ success: data.sent, title: args?.title || `${BRAND.browser}: Human Intervention Required`, message: args?.message || 'Notification sent' }),
  },
];
