/**
 * System Tray & Window Visibility
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const SYSTEM_TOOLS: ToolCatalogItem[] = [
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
