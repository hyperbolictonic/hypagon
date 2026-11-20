/**
 * The MCP resources the server exposes: the OKF guide, its manifest and partitions, and the
 * canonical "what to use when" order. Each partition is read from disk at request time, so a
 * doc edit does not require a rebuild.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RECOMMENDED_ORDER } from './browser-guide.js';

/** When to use: once at boot, before the tools are registered. */
export function registerResources(server: McpServer, guide: string): void {
  server.resource(
    'mark-eleven-skill',
    'mark-eleven://skills/guide',
    {
      description: 'Comprehensive operational manual, Golden Operational Sequence, and workflow skill guide for Mark Eleven in OKF (Outline Knowledge Format).',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'mark-eleven://skills/guide',
          mimeType: 'text/markdown',
          text: guide,
        },
      ],
    })
  );

  // 2. Standard MCP Resource: mark-eleven://okf/manifest
  server.resource(
    'okf-manifest',
    'mark-eleven://okf/manifest',
    {
      description: 'Open Knowledge Format (OKF) manifest for the Hypagon Browser docs bundle and its available partitions.',
      mimeType: 'application/json',
    },
    async () => {
      const manifestPath = path.resolve(process.cwd(), 'hypagon_docs', 'okf.json');
      let text = '{}';
      try { text = fs.readFileSync(manifestPath, 'utf8'); } catch {}
      return { contents: [{ uri: 'mark-eleven://okf/manifest', mimeType: 'application/json', text }] };
    }
  );

  // 3. Standard MCP Resource: mark-eleven://okf/partitions/selector-and-som
  server.resource(
    'okf-selector-som',
    'mark-eleven://okf/partitions/selector-and-som',
    {
      description: 'OKF Playbook: Golden Operational Sequence (Markdown -> Economy Screenshot -> Read-Only JS) and Set-of-Marks visual recipes.',
      mimeType: 'text/markdown',
    },
    async () => {
      const docPath = path.resolve(process.cwd(), 'hypagon_docs', 'partitions', 'selector_and_som_recipes.md');
      let text = '';
      try { text = fs.readFileSync(docPath, 'utf8'); } catch {}
      return { contents: [{ uri: 'mark-eleven://okf/partitions/selector-and-som', mimeType: 'text/markdown', text }] };
    }
  );

  // 4. Standard MCP Resource: mark-eleven://okf/partitions/captcha-and-anti-bot
  server.resource(
    'okf-captcha-antibot',
    'mark-eleven://okf/partitions/captcha-and-anti-bot',
    {
      description: 'OKF Playbook: Challenge Triage Matrix, Turnstile, text CAPTCHA solving, and HIL trigger rules.',
      mimeType: 'text/markdown',
    },
    async () => {
      const docPath = path.resolve(process.cwd(), 'hypagon_docs', 'partitions', 'captcha_and_anti_bot_strategies.md');
      let text = '';
      try { text = fs.readFileSync(docPath, 'utf8'); } catch {}
      return { contents: [{ uri: 'mark-eleven://okf/partitions/captcha-and-anti-bot', mimeType: 'text/markdown', text }] };
    }
  );

  // 5. Standard MCP Resource: mark-eleven://okf/partitions/browser-navigation
  server.resource(
    'okf-browser-navigation',
    'mark-eleven://okf/partitions/browser-navigation',
    {
      description: 'OKF Playbook: 0ms speculative prerender navigation, multi-tab orchestration, and session persistence.',
      mimeType: 'text/markdown',
    },
    async () => {
      const docPath = path.resolve(process.cwd(), 'hypagon_docs', 'partitions', 'browser_navigation_playbook.md');
      let text = '';
      try { text = fs.readFileSync(docPath, 'utf8'); } catch {}
      return { contents: [{ uri: 'mark-eleven://okf/partitions/browser-navigation', mimeType: 'text/markdown', text }] };
    }
  );

  // 6. Standard MCP Resource: mark-eleven://okf/partitions/primitives-and-workflows
  server.resource(
    'okf-primitives-workflows',
    'mark-eleven://okf/partitions/primitives-and-workflows',
    {
      description: 'OKF Reference: the orthogonal primitive layer (observe/act/wait_for/expect/find/extract/collect_all/page_state/diff/export_har/contexts), wait vocabulary, error codes, recipes R1-R5, and input-delivery guarantees.',
      mimeType: 'text/markdown',
    },
    async () => {
      const docPath = path.resolve(process.cwd(), 'hypagon_docs', 'partitions', 'primitives_and_workflows.md');
      let text = '';
      try { text = fs.readFileSync(docPath, 'utf8'); } catch {}
      return { contents: [{ uri: 'mark-eleven://okf/partitions/primitives-and-workflows', mimeType: 'text/markdown', text }] };
    }
  );

  server.resource(
    'tools-recommended',
    'mark-eleven://tools/recommended',
    {
      description: 'Canonical "what to use when" order across the five common jobs (read, find, act, wait, harvest).',
      mimeType: 'text/markdown',
    },
    async () => ({ contents: [{ uri: 'mark-eleven://tools/recommended', mimeType: 'text/markdown', text: RECOMMENDED_ORDER }] })
  );
}
