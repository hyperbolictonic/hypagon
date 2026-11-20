/**
 * Interaction (part 2 of 2)
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const INTERACTION_2_TOOLS: ToolCatalogItem[] = [
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
