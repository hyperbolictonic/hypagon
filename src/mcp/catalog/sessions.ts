/**
 * Sessions & Cookies
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const SESSIONS_TOOLS: ToolCatalogItem[] = [
  {
    name: 'save_session',
    hidden: true,
    deprecatedInFavorOf: 'context_save',
    description: 'Deprecated alias for context_save. Snapshots the current active browser session (cookies, localStorage, sessionStorage) into the persistent vault.',
    parameters: {
      name: z.string().describe('Unique name for the session snapshot (e.g. "github-auth")'),
    },
    endpoint: '/session/save',
    payload: (args) => ({ name: args.name }),
    format: (data, args) => `Session "${args.name}" saved successfully`,
  },
  {
    name: 'restore_session',
    hidden: true,
    deprecatedInFavorOf: 'context_open',
    description: 'Deprecated alias for context_open. Restores a previously saved session snapshot into the active browser partition.',
    parameters: {
      name: z.string().describe('Name of the session snapshot to restore'),
    },
    endpoint: '/session/restore',
    payload: (args) => ({ name: args.name }),
    format: (data, args) => `Session "${args.name}" restored successfully`,
  },
  {
    name: 'list_sessions',
    hidden: true,
    deprecatedInFavorOf: 'context_list',
    description: 'Deprecated alias for context_list. Returns all saved session profiles in the vault.',
    parameters: {},
    endpoint: '/session/list',
    method: 'GET',
    format: (data) => {
      const sess = Array.isArray(data.sessions) ? data.sessions : [];
      if (sess.length === 0) return 'No saved sessions found in vault.';
      const lines = sess.map((s: any) => {
        const cookies = s.cookieCount !== undefined ? `${s.cookieCount} cookies` : '';
        const savedAt = s.savedAt ? new Date(s.savedAt).toLocaleDateString() : '';
        return `- "${s.name || s.id}" (${[cookies, savedAt].filter(Boolean).join(', ')})`;
      });
      return `### Vault Sessions (${sess.length})\n${lines.join('\n')}`;
    },
  },
];
