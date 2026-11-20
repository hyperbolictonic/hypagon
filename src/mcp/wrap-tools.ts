/**
 * The meta-tools: what the agent calls on the Hypagon REST server.
 *
 * Registrations are grouped by job — discovery, secrets, authoring, derivation, execution.
 * `defineTool` is the one place a handler becomes an MCP result (via `bridgeTool`), so the
 * nine registrations differ only in their schema and their one bridge call.
 *
 * When to use: `createWrapMcpServer` registers them all once at boot.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callBridge } from './wrap-config.js';
import {
  asJson,
  asObject,
  bridgeFailure,
  failureText,
  formatManifest,
  formatSecrets,
  generatedWarning,
  resultText,
  runWrapperText,
  toolError,
  toolSuccess,
  wrapperRejection,
} from './wrap-format.js';
import type { GeneratedTools } from './wrap-generated.js';

/** A handler's outcome before it becomes an MCP tool result. */
type ToolText = { error: string } | { text: string };

/** When to use: registering one meta-tool — maps a refusal or a transport error to a result. */
function defineTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: Record<string, z.ZodTypeAny>,
  run: (args: any) => Promise<ToolText>,
): void {
  server.tool(name, description, inputSchema, async (args: any) => {
    try {
      const result = await run(args);
      return 'error' in result ? toolError(result.error) : toolSuccess(result.text);
    } catch (err: any) {
      return bridgeFailure(err);
    }
  });
}

/** When to use: wrap_list and wrap_reload — the manifest, optionally re-syncing generated tools. */
async function manifestText(generatedTools?: GeneratedTools): Promise<ToolText> {
  const response = await callBridge('/wrap/manifest');
  if (!response.ok) return failureText(response.data, `HTTP ${response.status}`);
  if (generatedTools) await generatedTools.refresh();
  return { text: formatManifest(response.data) };
}

/** When to use: wrap_create and wrap_update — the two differ only in action and confirmation. */
async function saveWrapper(action: 'create' | 'update', wrapper: unknown, generatedTools: GeneratedTools): Promise<ToolText> {
  const response = await callBridge('/wrap/wrappers', 'POST', { action, wrapper: asObject(wrapper) });
  const rejected = wrapperRejection(response);
  if (rejected) return { error: rejected };

  const sync = await generatedTools.refresh();
  const saved = response.data.wrapper;
  const confirmation =
    action === 'create'
      ? `Created ${saved?.id}. Call wrap_test with dryRun first, then wrap_run.`
      : `Updated ${saved?.id}. Run wrap_test with dryRun to verify the change.`;
  return { text: `${confirmation}${generatedWarning(saved, sync)}` };
}

/** When to use: registering wrap_list / wrap_get / wrap_reload. */
export function registerDiscoveryTools(server: McpServer, generatedTools: GeneratedTools): void {
  defineTool(
    server,
    'wrap_list',
    'List saved REST wrappers as one line each: id, purpose, method/host, required arguments. Call this before wrap_get or wrap_run.',
    {},
    () => manifestText(),
  );

  defineTool(
    server,
    'wrap_get',
    'Show one wrapper in full: input schema, request template, and response recipe. Use wrap_list to discover ids.',
    { id: z.string().describe('Wrapper id, for example "orders.create"') },
    async ({ id }) => {
      const response = await callBridge(`/wrap/wrapper?id=${encodeURIComponent(id)}`);
      if (!response.ok || !response.data?.wrapper) return failureText(response.data, `No wrapper named "${id}".`);
      return { text: JSON.stringify(response.data.wrapper, null, 2) };
    },
  );

  defineTool(
    server,
    'wrap_reload',
    'Re-read the wrapper manifest. The server is stateless, so this is mainly a compatibility alias for wrap_list after an external file change.',
    {},
    () => manifestText(generatedTools),
  );
}

/** When to use: registering wrap_secret_list. */
export function registerSecretTools(server: McpServer): void {
  defineTool(
    server,
    'wrap_secret_list',
    'List credential names a human has bound to hosts. Values are never available to this server. Use a name in request.auth; the main process attaches it only when the request host is allowed.',
    {},
    async () => {
      const response = await callBridge('/wrap/secrets');
      if (!response.ok) return failureText(response.data, `HTTP ${response.status}`);
      return { text: formatSecrets(response.data) };
    },
  );
}

/** When to use: registering wrap_create / wrap_update / wrap_delete. */
export function registerAuthoringTools(server: McpServer, generatedTools: GeneratedTools): void {
  defineTool(
    server,
    'wrap_create',
    'Save a new REST wrapper. Supply the complete wrapper object: id, name, request (method, url, optional query/headers/body templates, optional auth secret name), inputSchema (game-facing arguments), and response (recipe). Never include a credential value; request.auth is a name only, and only a human can create it. Set `exposeAsTool: true` to register a generated `wrap_<id>` tool (capped by HB_WRAP_MAX_TOOLS, default 40).',
    { wrapper: z.record(z.string(), z.unknown()).describe('Complete wrapper object. Use flat input arguments, not URL or header JSON.') },
    ({ wrapper }) => saveWrapper('create', wrapper, generatedTools),
  );

  defineTool(
    server,
    'wrap_update',
    'Replace an existing wrapper. Use the same complete object as wrap_create; the id identifies which wrapper to replace.',
    { wrapper: z.record(z.string(), z.unknown()).describe('Complete replacement wrapper object.') },
    ({ wrapper }) => saveWrapper('update', wrapper, generatedTools),
  );

  defineTool(
    server,
    'wrap_delete',
    'Delete a saved wrapper by id. This removes the saved request and recipe; it does not affect the remote API.',
    { id: z.string().describe('Wrapper id to delete') },
    async ({ id }) => {
      const response = await callBridge('/wrap/wrappers', 'POST', { action: 'delete', id });
      if (!response.data?.success) return failureText(response.data, `No wrapper named "${id}".`);
      await generatedTools.refresh();
      return { text: `Deleted ${id}.` };
    },
  );
}

/** When to use: registering wrap_derive. */
export function registerDeriveTool(server: McpServer): void {
  defineTool(
    server,
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
    async ({ sample, url, id, name, description, max_fields }) => {
      const response = await callBridge('/wrap/derive', 'POST', {
        sample,
        url,
        id,
        name,
        description,
        max_fields,
      });
      if (!response.ok || response.data?.success === false) return failureText(response.data, `HTTP ${response.status}`);
      const recipe = response.data.recipe;
      return {
        text:
          `## Derived recipe (from ${response.data.source})\n\n\`\`\`json\n${JSON.stringify(recipe, null, 2)}\n\`\`\`\n\n` +
          'Pass this as `response` to wrap_create (or wrap_update), then wrap_test it against a real call.',
      };
    },
  );
}

/** When to use: registering wrap_run / wrap_test. */
export function registerExecutionTools(server: McpServer): void {
  defineTool(
    server,
    'wrap_run',
    'Execute a saved wrapper with flat semantic arguments. The saved request supplies the URL, headers, auth, and body shape; pass only the arguments declared by wrap_get. Returns readable Markdown and structured records. When the recipe declares pagination, the executor follows pages up to a cap and merges them into one result (the footer reports pages used); pass max_pages to widen or narrow it.',
    {
      id: z.string().describe('Wrapper id from wrap_list'),
      args: z.record(z.string(), z.unknown()).optional().describe('Flat arguments matching the wrapper inputSchema'),
      format: z.enum(['markdown', 'json', 'both']).optional().describe('markdown (default), json records, or both'),
      max_pages: z.coerce.number().optional().describe('Page cap for a paginated recipe (default 10, max 25)'),
    },
    async ({ id, args, format, max_pages }) => {
      const result = await runWrapperText({
        id,
        args: asObject(args || {}) || {},
        format: format || 'markdown',
        maxPages: max_pages,
      });
      return result.ok ? { text: result.text } : { error: result.text };
    },
  );

  defineTool(
    server,
    'wrap_test',
    'Verify a wrapper without sending a live request. Dry-run previews the exact method, URL, headers, and body. Pass sample (a JSON response body) to check the recipe rendering instead. Defaults to dryRun.',
    {
      id: z.string().optional().describe('Saved wrapper id'),
      wrapper: z.record(z.string(), z.unknown()).optional().describe('Unsaved wrapper object to test'),
      args: z.record(z.string(), z.unknown()).optional().describe('Arguments for the dry-run request'),
      sample: z.unknown().optional().describe('Sample JSON response to render through the recipe'),
      dryRun: z.boolean().optional().describe('Preview only; defaults to true'),
    },
    async ({ id, wrapper, args, sample, dryRun }) => {
      const payload: Record<string, unknown> = {
        id,
        args: asObject(args || {}) || {},
        dryRun: dryRun !== false,
      };
      if (wrapper !== undefined) payload.wrapper = asObject(wrapper);
      if (sample !== undefined) payload.sample = asJson(sample);

      const response = await callBridge('/wrap/test', 'POST', payload);
      const data = response.data;
      if (!data) return { error: `No response from the wrapper bridge (HTTP ${response.status}).` };

      const text = resultText(data, 'markdown');
      return data.ok === false ? { error: text } : { text };
    },
  );
}
