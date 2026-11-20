/**
 * Navigation
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';
import { normalizeDestination } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const NAVIGATION_TOOLS: ToolCatalogItem[] = [
  {
    name: 'navigate_to',
    description: 'Navigates the real, visible Chromium browser window to a destination URL. Automatically dismisses GDPR/cookie consent overlays by default.',
    parameters: {
      url: z.string().describe('The destination URL (e.g. "https://news.ycombinator.com" or "https://www.skyscanner.net")'),
      auto_dismiss_consent: z.boolean().optional().default(true).describe('Whether to automatically detect and dismiss cookie/GDPR consent overlays (default: true)'),
    },
    endpoint: '/navigate',
    payload: (args) => {
      return { url: normalizeDestination(args), autoDismissConsent: args?.auto_dismiss_consent ?? true };
    },
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
    payload: (args) => {
      return { url: normalizeDestination(args) };
    },
    format: (data) => data.result || 'Navigation complete',
  },
];
