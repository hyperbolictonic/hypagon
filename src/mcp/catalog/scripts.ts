/**
 * Script Vault & Macro Engine
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const SCRIPTS_TOOLS: ToolCatalogItem[] = [
  {
    name: 'save_script',
    description: 'Saves a reusable browser JavaScript automation script into the persistent vault and Cortex vector index.',
    parameters: {
      name: z.string().describe('Unique name of the script'),
      description: z.string().describe('Natural language description of what the script does'),
      code: z.string().describe('Executable JavaScript code string'),
      parameters: z.record(z.string(), z.string()).optional().describe('Map of parameter names to descriptions'),
    },
    endpoint: '/scripts/save',
    payload: (args) => ({ name: args.name, description: args.description, code: args.code, parameters: args.parameters }),
    format: (data, args) => `Script "${args.name}" vaulted successfully`,
  },
  {
    name: 'run_script',
    description: 'Executes a saved script from the Script Vault inside the active tab context with dynamic arguments.',
    parameters: {
      name: z.string().describe('Name of the script to execute'),
      args: z.record(z.string(), z.any()).optional().describe('Key-value arguments passed into script execution context'),
    },
    endpoint: '/scripts/run',
    payload: (args) => ({ name: args.name, args: args.args }),
    format: (data) => JSON.stringify(data.result, null, 2),
  },
  {
    name: 'list_scripts',
    description: 'Lists or searches saved automation scripts in the Script Vault. Pass query to search by natural-language relevance (ranked); omit it to list everything. Pass tag for an exact tag match.',
    parameters: {
      query: z.string().optional().describe('Natural-language search across script name, description, code, and tags (ranked by relevance)'),
      tag: z.string().optional().describe('Filter by exact tag'),
      limit: z.number().optional().default(100).describe('Max scripts to return'),
    },
    endpoint: '/scripts/list',
    method: 'GET',
    payload: (args) => ({
      queryParams: {
        ...(args?.query ? { q: args.query } : {}),
        ...(args?.tag ? { tag: args.tag } : {}),
        limit: String(args?.limit ?? 100),
      },
    }),
    format: (data) => {
      const scripts = Array.isArray(data.scripts) ? data.scripts : [];
      if (scripts.length === 0) return 'No matching scripts in vault.';
      const lines = scripts.map((s: any) => {
        const score = typeof s.score === 'number' ? ` (score: ${s.score.toFixed(2)})` : '';
        return `- "${s.name}"${score}: ${s.description || 'No description'}`;
      });
      return `### Script Vault (${scripts.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'delete_script',
    description: 'Deletes a saved script from the persistent vault and LanceDB vector index.',
    parameters: {
      name: z.string().describe('Name of script to delete'),
    },
    endpoint: '/scripts/delete',
    payload: (args) => ({ name: args.name }),
    format: (data, args) => (data.deleted ? `Deleted script "${args.name}"` : `Script "${args.name}" not found`),
  },
];
