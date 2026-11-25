/**
 * The OKF resources the server publishes: the guide, the bundle manifest, the four
 * partition playbooks and the recommended tool order.
 *
 * Why a module: seven registrations, each a description plus a file read. They are
 * content routing, not server logic — and five of them differ only in which document
 * they serve, so they are a table.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RECOMMENDED_ORDER, buildSkillGuide, type SkillGuideFlags } from './skill-guide.js';

/** One file-backed resource: its identity and the document it serves. */
interface DocumentResource {
  name: string;
  uri: string;
  description: string;
  mimeType: string;
  /** Path segments under the working directory. */
  segments: string[];
  /** What to serve when the file is missing. */
  fallback: string;
}

const DOCUMENTS: DocumentResource[] = [
  {
    name: 'okf-manifest',
    uri: 'mark-eleven://okf/manifest',
    description:
      'Open Knowledge Format (OKF) manifest for the Hypagon Browser docs bundle and its available partitions.',
    mimeType: 'application/json',
    segments: ['hypagon_docs', 'okf.json'],
    fallback: '{}',
  },
  {
    name: 'okf-selector-som',
    uri: 'mark-eleven://okf/partitions/selector-and-som',
    description:
      'OKF Playbook: Golden Operational Sequence (Markdown -> Economy Screenshot -> Read-Only JS) and Set-of-Marks visual recipes.',
    mimeType: 'text/markdown',
    segments: ['hypagon_docs', 'partitions', 'selector_and_som_recipes.md'],
    fallback: '',
  },
  {
    name: 'okf-captcha-antibot',
    uri: 'mark-eleven://okf/partitions/captcha-and-anti-bot',
    description: 'OKF Playbook: Challenge Triage Matrix, Turnstile, text CAPTCHA solving, and HIL trigger rules.',
    mimeType: 'text/markdown',
    segments: ['hypagon_docs', 'partitions', 'captcha_and_anti_bot_strategies.md'],
    fallback: '',
  },
  {
    name: 'okf-browser-navigation',
    uri: 'mark-eleven://okf/partitions/browser-navigation',
    description:
      'OKF Playbook: 0ms speculative prerender navigation, multi-tab orchestration, and session persistence.',
    mimeType: 'text/markdown',
    segments: ['hypagon_docs', 'partitions', 'browser_navigation_playbook.md'],
    fallback: '',
  },
  {
    name: 'okf-primitives-workflows',
    uri: 'mark-eleven://okf/partitions/primitives-and-workflows',
    description:
      'OKF Reference: the orthogonal primitive layer (observe/act/wait_for/expect/find/extract/collect_all/page_state/diff/export_har/contexts), wait vocabulary, error codes, recipes R1-R5, and input-delivery guarantees.',
    mimeType: 'text/markdown',
    segments: ['hypagon_docs', 'partitions', 'primitives_and_workflows.md'],
    fallback: '',
  },
];

/** When to use: a document resource — the file, or its fallback when absent. */
function readDocument(segments: string[], fallback: string): string {
  try {
    return fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf8');
  } catch {
    return fallback;
  }
}

/** When to use: the guide resource — it is generated, not read from disk. */
function registerGuide(server: McpServer, flags: SkillGuideFlags): void {
  server.resource(
    'mark-eleven-skill',
    'mark-eleven://skills/guide',
    {
      description:
        'Comprehensive operational manual, Golden Operational Sequence, and workflow skill guide for Mark Eleven in OKF (Outline Knowledge Format).',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'mark-eleven://skills/guide',
          mimeType: 'text/markdown',
          text: buildSkillGuide(flags),
        },
      ],
    }),
  );
}

/** When to use: the manifest and the four partition playbooks. */
function registerDocuments(server: McpServer): void {
  for (const document of DOCUMENTS) {
    server.resource(
      document.name,
      document.uri,
      { description: document.description, mimeType: document.mimeType },
      async () => ({
        contents: [
          {
            uri: document.uri,
            mimeType: document.mimeType,
            text: readDocument(document.segments, document.fallback),
          },
        ],
      }),
    );
  }
}

/** When to use: `mark-eleven://tools/recommended` — the canonical "what to use when". */
function registerRecommended(server: McpServer): void {
  server.resource(
    'tools-recommended',
    'mark-eleven://tools/recommended',
    {
      description: 'Canonical "what to use when" order across the five common jobs (read, find, act, wait, harvest).',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [{ uri: 'mark-eleven://tools/recommended', mimeType: 'text/markdown', text: RECOMMENDED_ORDER }],
    }),
  );
}

/** When to use: `createBridgeMcpServer` — register every `mark-eleven://` resource. */
export function registerBridgeResources(server: McpServer, flags: SkillGuideFlags): void {
  registerGuide(server, flags);
  registerDocuments(server);
  registerRecommended(server);
}
