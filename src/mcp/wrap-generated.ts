/**
 * Generated `wrap_<id>` tools for wrappers saved with `exposeAsTool: true`.
 *
 * The registry reconciles itself with the manifest on every wrapper mutation: register the
 * first `GENERATED_TOOL_CAP` exposed wrappers by id, remove the ones that no longer qualify.
 * The SDK emits `tools/list_changed` itself on register/remove, so no explicit notification is
 * needed.
 *
 * When to use: `createWrapMcpServer` — one registry per server, refreshed after create/update/
 * delete and once at boot.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { generatedToolName, wrapInputToZodShape } from './wrap-tool-schema.js';
import { GENERATED_TOOL_CAP, META_TOOL_NAMES, callBridge } from './wrap-config.js';
import { bridgeFailure, runWrapperText, toolError, toolSuccess } from './wrap-format.js';

/** When to use: the server's generated-tool registry. */
export interface GeneratedTools {
  refresh(): Promise<{ added: number; removed: number; cap: number; exposed: string[] }>;
}

/** When to use: once per server, before the meta-tools register. */
export function createGeneratedTools(server: McpServer): GeneratedTools {
  /** Generated `wrap_<id>` tools, keyed by the registered tool name. */
  const generated = new Map<string, { remove(): void }>();

  /**
   * Reconcile the generated tool set with the manifest: register `wrap_<id>` for every
   * wrapper with `exposeAsTool: true` (first `GENERATED_TOOL_CAP` by id), remove the ones that
   * no longer qualify. Returns how many were added/removed so callers can decide to notify.
   */
  async function refresh(): Promise<{ added: number; removed: number; cap: number; exposed: string[] }> {
    const unavailable = { added: 0, removed: 0, cap: GENERATED_TOOL_CAP, exposed: [] as string[] };

    let manifest: any;
    try {
      const response = await callBridge('/wrap/manifest');
      if (!response.ok) return unavailable;
      manifest = response.data;
    } catch {
      return unavailable;
    }

    const exposed = (Array.isArray(manifest?.wrappers) ? manifest.wrappers : [])
      .filter((entry: any) => entry?.exposeAsTool === true)
      .sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
      .slice(0, GENERATED_TOOL_CAP);

    const exposedIds = exposed.map((entry: any) => String(entry.id));

    const wanted = new Set<string>();
    let added = 0;

    for (const entry of exposed) {
      const detail = await callBridge(`/wrap/wrapper?id=${encodeURIComponent(String(entry.id))}`).catch(() => null);
      const wrapper = detail?.data?.wrapper;
      if (!wrapper) continue;

      const name = generatedToolName(String(entry.id), new Set([...META_TOOL_NAMES, ...wanted]));
      wanted.add(name);
      if (generated.has(name)) continue;

      const description =
        `[wrap] ${entry.name || entry.id} — ${entry.method} ${entry.host}. ` +
        `${entry.description ? entry.description + ' ' : ''}` +
        'Typed shortcut for wrap_run; the saved request supplies the URL, headers, auth and body.';
      const tool = server.registerTool(
        name,
        { description, inputSchema: wrapInputToZodShape(wrapper.inputSchema) },
        async (args: any) => {
          try {
            const result = await runWrapperText({ id: String(entry.id), args: args || {}, format: 'markdown' });
            return result.ok ? toolSuccess(result.text) : toolError(result.text);
          } catch (err: any) {
            return bridgeFailure(err);
          }
        },
      );
      generated.set(name, tool);
      added++;
    }

    let removed = 0;
    for (const [name, tool] of generated) {
      if (wanted.has(name)) continue;
      try {
        tool.remove();
      } catch {
        /* already gone */
      }
      generated.delete(name);
      removed++;
    }

    return { added, removed, cap: GENERATED_TOOL_CAP, exposed: exposedIds };
  }

  return { refresh };
}
