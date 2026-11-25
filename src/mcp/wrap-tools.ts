/**
 * The ten meta-tools of Hypagon REST, and nothing else.
 *
 * Why a module: they all share one envelope (`bridgeTool`), one bridge client and one renderer
 * set, but each owns its own schema and wording. Keeping them together is what lets the server
 * module read as "build, register, reconcile, serve".
 *
 * Why it reads as groups: reading, deriving, writing and running are separate jobs, so each is
 * its own registrar and `registerWrapTools` is only the order they are registered in.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { bridgeError, callBridge, type BridgeResponse } from './wrap-bridge.js';
import { bridgeTool } from './wrap-tool-result.js';
import { errorText } from './wrap-messages.js';
import {
  asJson,
  formatManifest,
  formatSecrets,
  generatedWarning,
  resultText,
  wrapperRejection,
} from './wrap-format.js';
import type { GeneratedTools, GeneratedSync } from './wrap-generated-tools.js';

/** Both write tools refresh the generated tools and describe the saved wrapper. */
async function wrapperSaved(
  data: any,
  created: boolean,
  refresh: () => Promise<GeneratedSync>,
): Promise<string> {
  const saved = data.wrapper;
  const sync = await refresh();
  const next = created ? 'Call wrap_test with dryRun first, then wrap_run.' : 'Run wrap_test with dryRun to verify the change.';
  return `${created ? 'Created' : 'Updated'} ${saved?.id}. ${next}${generatedWarning(saved, sync)}`;
}

/** wrap_list, wrap_get and wrap_secret_list: what exists, in full, and what it can use. */
function registerReadTools(server: McpServer): void {
  server.tool(
    'wrap_list',
    'List saved REST wrappers as one line each: id, purpose, method/host, required arguments. Call this before wrap_get or wrap_run.',
    {},
    () =>
      bridgeTool(
        () => callBridge('/wrap/manifest'),
        bridgeError,
        (data) => formatManifest(data),
      ),
  );

  server.tool(
    'wrap_get',
    'Show one wrapper in full: input schema, request template, and response recipe. Use wrap_list to discover ids.',
    { id: z.string().describe('Wrapper id, for example "orders.create"') },
    ({ id }) =>
      bridgeTool(
        () => callBridge(`/wrap/wrapper?id=${encodeURIComponent(id)}`),
        (r) => (r.ok && r.data?.wrapper ? undefined : errorText(r.data?.code, r.data?.error || `No wrapper named "${id}".`)),
        (data) => JSON.stringify(data.wrapper, null, 2),
      ),
  );

  server.tool(
    'wrap_secret_list',
    'List credential names a human has bound to hosts. Values are never available to this server. Use a name in request.auth; the main process attaches it only when the request host is allowed.',
    {},
    () =>
      bridgeTool(
        () => callBridge('/wrap/secrets'),
        bridgeError,
        (data) => formatSecrets(data),
      ),
  );
}

/** wrap_derive: a first-draft response recipe from a sample or a live URL. */
function registerDeriveTool(server: McpServer): void {
  server.tool(
    'wrap_derive',
    'Derive a first-draft response recipe from a JSON sample (an object, an array, or a JSON string) or from a live URL. Returns a recipe you can drop into wrap_create/wrap_update as `response`. It reads the shape only — primitive fields, a table for arrays, a document for objects — so edit it afterwards if you need nested or formatted fields.',
    {
      sample: z.unknown().optional().describe('A JSON sample: an object, an array, or a JSON string'),
      url: z.string().optional().describe('Fetch this URL with a policy-checked GET and derive from its JSON (ignored when sample is given)'),
      id: z.string().optional().describe('Optional recipe id'),
      name: z.string().optional().describe('Optional recipe name'),
      description: z.string().optional(),
      max_fields: z.coerce.number().optional().describe('Maximum fields to infer (default 12, max 60)'),
    },
    ({ sample, url, id, name, description, max_fields }) =>
      bridgeTool(
        () => callBridge('/wrap/derive', 'POST', { sample, url, id, name, description, max_fields }),
        (r) => (r.ok && r.data?.success !== false ? undefined : errorText(r.data?.code, r.data?.error || `HTTP ${r.status}`)),
        (data) =>
          `## Derived recipe (from ${data.source})\n\n\`\`\`json\n${JSON.stringify(data.recipe, null, 2)}\n\`\`\`\n\n` +
          'Pass this as `response` to wrap_create (or wrap_update), then wrap_test it against a real call.',
      ),
  );
}

/**
 * One saved-wrapper write tool. create and update differ only in the action, the wording and
 * whether the reply says "Created"; the envelope and the generated-tool refresh are shared.
 */
function registerWrapperWrite(
  server: McpServer,
  refresh: () => Promise<GeneratedSync>,
  options: { action: 'create' | 'update'; description: string; inputDescription: string; created: boolean },
): void {
  server.tool(
    `wrap_${options.action}`,
    options.description,
    {
      wrapper: z.record(z.string(), z.unknown()).describe(options.inputDescription),
    },
    ({ wrapper }) =>
      bridgeTool(
        () => callBridge('/wrap/wrappers', 'POST', { action: options.action, wrapper: asJson(wrapper) }),
        wrapperRejection,
        (data) => wrapperSaved(data, options.created, refresh),
      ),
  );
}

/** wrap_create, wrap_update and wrap_delete: the three mutations, each refreshing the tools. */
function registerWriteTools(server: McpServer, generated: GeneratedTools): void {
  const refresh = () => generated.sync();

  registerWrapperWrite(server, refresh, {
    action: 'create',
    description:
      'Save a new REST wrapper. Supply the complete wrapper object: id, name, request (method, url, optional query/headers/body templates, optional auth secret name), inputSchema (game-facing arguments), and response (recipe). Never include a credential value; request.auth is a name only, and only a human can create it. Set `exposeAsTool: true` to register a generated `wrap_<id>` tool (capped by HB_WRAP_MAX_TOOLS, default 40).',
    inputDescription: 'Complete wrapper object. Use flat input arguments, not URL or header JSON.',
    created: true,
  });
  registerWrapperWrite(server, refresh, {
    action: 'update',
    description:
      'Replace an existing wrapper. Use the same complete object as wrap_create; the id identifies which wrapper to replace.',
    inputDescription: 'Complete replacement wrapper object.',
    created: false,
  });

  server.tool(
    'wrap_delete',
    'Delete a saved wrapper by id. This removes the saved request and recipe; it does not affect the remote API.',
    { id: z.string().describe('Wrapper id to delete') },
    ({ id }) =>
      bridgeTool(
        () => callBridge('/wrap/wrappers', 'POST', { action: 'delete', id }),
        (r) => (r.data?.success ? undefined : errorText(r.data?.code, r.data?.error || `No wrapper named "${id}".`)),
        async () => {
          await refresh();
          return `Deleted ${id}.`;
        },
      ),
  );
}

/** wrap_run, wrap_test and wrap_reload: execute, preview, re-read. */
function registerRunTools(server: McpServer, generated: GeneratedTools): void {
  server.tool(
    'wrap_run',
    'Execute a saved wrapper with flat semantic arguments. The saved request supplies the URL, headers, auth, and body shape; pass only the arguments declared by wrap_get. Returns readable Markdown and structured records. When the recipe declares pagination, the executor follows pages up to a cap and merges them into one result (the footer reports pages used); pass max_pages to widen or narrow it.',
    {
      id: z.string().describe('Wrapper id from wrap_list'),
      args: z.record(z.string(), z.unknown()).optional().describe('Flat arguments matching the wrapper inputSchema'),
      format: z.enum(['markdown', 'json', 'both']).optional().describe('markdown (default), json records, or both'),
      max_pages: z.coerce.number().optional().describe('Page cap for a paginated recipe (default 10, max 25)'),
    },
    ({ id, args, format, max_pages }) =>
      bridgeTool(
        () =>
          callBridge('/wrap/run', 'POST', {
            id,
            args: asJson(args || {}) || {},
            format: format || 'markdown',
            maxPages: max_pages,
          }),
        (r) => (!r.data ? `No response from the wrapper bridge (HTTP ${r.status}).` : r.data.ok === false ? resultText(r.data, format || 'markdown') : undefined),
        (data) => resultText(data, format || 'markdown'),
      ),
  );

  server.tool(
    'wrap_test',
    'Verify a wrapper without sending a live request. Dry-run previews the exact method, URL, headers, and body. Pass sample (a JSON response body) to check the recipe rendering instead. Defaults to dryRun.',
    {
      id: z.string().optional().describe('Saved wrapper id'),
      wrapper: z.record(z.string(), z.unknown()).optional().describe('Unsaved wrapper object to test'),
      args: z.record(z.string(), z.unknown()).optional().describe('Arguments for the dry-run request'),
      sample: z.unknown().optional().describe('Sample JSON response to render through the recipe'),
      dryRun: z.boolean().optional().describe('Preview only; defaults to true'),
    },
    ({ id, wrapper, args, sample, dryRun }) =>
      bridgeTool(
        () => {
          const payload: Record<string, unknown> = {
            id,
            args: asJson(args || {}) || {},
            dryRun: dryRun !== false,
          };
          if (wrapper !== undefined) payload.wrapper = asJson(wrapper);
          if (sample !== undefined) payload.sample = asJson(sample);
          return callBridge('/wrap/test', 'POST', payload);
        },
        (r) => (!r.data ? `No response from the wrapper bridge (HTTP ${r.status}).` : r.data.ok === false ? resultText(r.data, 'markdown') : undefined),
        (data) => resultText(data, 'markdown'),
      ),
  );

  server.tool(
    'wrap_reload',
    'Re-read the wrapper manifest. The server is stateless, so this is mainly a compatibility alias for wrap_list after an external file change.',
    {},
    () =>
      bridgeTool(
        () => callBridge('/wrap/manifest'),
        bridgeError,
        async (data) => {
          await generated.sync();
          return formatManifest(data);
        },
      ),
  );
}

/**
 * When to use: `createWrapMcpServer` — register every meta-tool on a fresh server.
 * `generated` is refreshed after any mutation so a saved wrapper can become a tool.
 */
export function registerWrapTools(server: McpServer, generated: GeneratedTools): void {
  registerReadTools(server);
  registerDeriveTool(server);
  registerWriteTools(server, generated);
  registerRunTools(server, generated);
}

