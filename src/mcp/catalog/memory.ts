/**
 * Memory & Cortex (LanceDB)
 *
 * One entry per MCP tool: its schema, the bridge route it calls, and how the result is rendered.
 */
import { z } from 'zod';
import type { ToolCatalogItem } from './shared.js';

/** When to use: composed into TOOLS_CATALOG — do not import a family directly. */
export const MEMORY_TOOLS: ToolCatalogItem[] = [
  {
    name: 'recall_memory',
    description: 'Performs semantic vector and full-text hybrid search across all previously visited and harvested web pages in the persistent Cortex.',
    parameters: {
      query: z.string().describe('Natural language query to search page history memory'),
      limit: z.number().optional().default(5).describe('Max results (default: 5)'),
      domain: z.string().optional().describe('Filter by domain (e.g. "wikipedia.org")'),
    },
    endpoint: '/cortex/recall',
    payload: (args) => ({ query: args.query, limit: args.limit, domain: args.domain }),
    format: (data) => JSON.stringify(data.results, null, 2),
  },
  {
    name: 'browsing_history',
    description: 'Retrieves chronological browsing history from the Cortex store.',
    parameters: {
      limit: z.number().optional().default(20).describe('Max history entries (default: 20)'),
      domain: z.string().optional().describe('Filter by domain'),
    },
    endpoint: '/cortex/history',
    method: 'GET',
    payload: (args) => ({
      queryParams: {
        limit: String(args?.limit ?? 20),
        ...(args?.domain ? { domain: args.domain } : {}),
      },
    }),
    format: (data) => {
      const hist = Array.isArray(data.history) ? data.history : [];
      if (hist.length === 0) return 'No browsing history entries found.';
      const lines = hist.map((h: any) => {
        const time = h.visitedAt ? new Date(h.visitedAt).toLocaleDateString() : '';
        return `- [${time}] "${h.title || 'Untitled'}" - ${h.url}`;
      });
      return `### Browsing History (${hist.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'browsing_history_clear',
    description: 'Clears the chronological browsing history table in the Cortex database.',
    parameters: {},
    endpoint: '/cortex/history/clear',
    format: (data) => data.message || 'History cleared',
  },
  {
    name: 'add_bookmark',
    description: 'Saves a bookmark into the persistent Cortex library with custom tags and research notes.',
    parameters: {
      url: z.string().describe('Bookmark target URL'),
      title: z.string().describe('Descriptive title'),
      notes: z.string().optional().describe('Research notes or key takeaways'),
      tags: z.array(z.string()).optional().describe('Array of semantic categorization tags'),
    },
    endpoint: '/bookmarks/add',
    payload: (args) => ({ url: args.url, title: args.title, notes: args.notes, tags: args.tags }),
    format: (data, args) => `Bookmark saved: ${data.id || args.url}`,
  },
  {
    name: 'list_bookmarks',
    description: 'Retrieves saved bookmarks. Pass query to filter by terms found in the title, notes, URL, or tags (matches are ranked by relevance); pass tag for an exact tag match.',
    parameters: {
      query: z.string().optional().describe('Filter terms matched against bookmark title, notes, URL, and tags (every term must appear)'),
      tag: z.string().optional().describe('Filter by exact tag'),
      limit: z.number().optional().default(20).describe('Max bookmarks to return'),
    },
    endpoint: '/bookmarks',
    method: 'GET',
    payload: (args) => ({
      queryParams: {
        ...(args?.query ? { q: args.query } : {}),
        ...(args?.tag ? { tag: args.tag } : {}),
        limit: String(args?.limit ?? 20),
      },
    }),
    format: (data) => {
      const bm = Array.isArray(data.bookmarks) ? data.bookmarks : [];
      if (bm.length === 0) return 'No bookmarks found.';
      const lines = bm.map((b: any) => {
        const tags = Array.isArray(b.tags) && b.tags.length > 0 ? ` [${b.tags.join(', ')}]` : '';
        return `- [${b.id || 'bm'}] "${b.title || 'Untitled'}" - ${b.url}${tags}`;
      });
      return `### Saved Bookmarks (${bm.length})\n${lines.join('\n')}`;
    },
  },
  {
    name: 'delete_bookmark',
    description: 'Removes a bookmark by URL or ID from the persistent database.',
    parameters: {
      url_or_id: z.string().describe('The bookmark ID or exact URL to remove'),
    },
    endpoint: '/bookmarks/delete',
    payload: (args) => ({ urlOrId: args.url_or_id }),
    format: (data, args) => (data.deleted ? `Bookmark deleted: ${args.url_or_id}` : `Bookmark not found: ${args.url_or_id}`),
  },
];
