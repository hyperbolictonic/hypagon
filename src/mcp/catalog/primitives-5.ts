/**
 * Primitives Layer — one observe / act / wait / extract model. (part 5 of 5)
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const PRIMITIVES_5_TOOLS: ToolCatalogItem[] = [
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
