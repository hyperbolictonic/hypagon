import { z } from 'zod';
import { BRAND } from '../shared/brand.js';
import type { ToolCatalogItem } from './tools-catalog-types.js';

/** When to use: the catalog segment fronting human-in-the-loop, notifications, window visibility and the system tray. */
export const DESKTOP_TOOLS: ToolCatalogItem[] = [
{
    name: 'request_human_intervention',
    description: 'PROACTIVELY call this whenever encountering CAPTCHAs, Cloudflare Turnstile, login/2FA prompts, payment checkouts, or unexpected roadblocks. Halts agent execution, triggers audible desktop alerts, unhides and brings window to front, flashes taskbar, and presents an interactive HUD banner for human assistance.',
    parameters: {
      reason: z.string().describe('Clear explanation of what human action is needed (e.g. "Please solve the Cloudflare Turnstile challenge" or "Please enter 2FA code")'),
      timeout_seconds: z.number().optional().describe('Max seconds to wait for human action (default: 180)'),
      bring_to_front: z.boolean().optional().default(true).describe('Whether to unhide/restore window from tray and bring to front (default: true)'),
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
    format: (data) => JSON.stringify(data, null, 2),
  },
{
    name: 'get_human_activity',
    description: 'Reports explicit human control: whether a person has pressed TAKE OVER and is blocking synthetic input (HUMAN_CONTROL / HUMAN_IN_PROGRESS), how long, and the last human page event. Page input alone no longer pauses the agent.',
    parameters: {},
    endpoint: '/human/status',
    method: 'GET',
    format: (data) => JSON.stringify(data, null, 2),
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
{
    name: 'set_window_visibility',
    description: 'Shows/restores or hides the Cyberdeck desktop window. Showing (the default) also brings the window to the foreground and focuses it — use this to make the window visible to a human (HIL); pass focus=false to show without stealing focus. Synthetic agent input is focus-independent, so this is not needed for normal driving.',
    parameters: {
      visible: z.coerce.boolean().optional().describe('true to restore and show the window (default); false to minimize/hide to the system tray'),
      focus: z.coerce.boolean().optional().describe('When showing, whether to bring the window to the foreground and focus it (default: true)'),
    },
    endpoint: '/window/visibility',
    payload: (args) => ({
      visible: args?.visible !== undefined ? Boolean(args.visible) : true,
      ...(args?.focus !== undefined ? { focus: Boolean(args.focus) } : {}),
    }),
    format: (data, args) => JSON.stringify({ success: true, visible: data.visible, focused: data.focused, state: (args?.visible ?? true) ? 'WINDOW_RESTORED' : 'MINIMIZED_TO_TRAY' }),
  },
{
    name: 'configure_system_tray',
    description: 'Inspects or configures system tray behavior (such as enabling/disabling close-to-tray).',
    parameters: {
      close_to_tray: z.boolean().optional().describe('If specified, enables (true) or disables (false) minimize-to-tray when closing window'),
    },
    endpoint: '/window/tray',
    payload: (args) => ({ closeToTray: args?.close_to_tray }),
    format: (data) => JSON.stringify({ close_to_tray: data.closeToTray }, null, 2),
  },
];
