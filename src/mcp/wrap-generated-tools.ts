/**
 * The generated `wrap_<id>` tools: the wrappers whose author set `exposeAsTool: true`.
 *
 * Why a module: registration, the by-id-first cap, the name collision rule and removal of tools
 * that no longer qualify are one reconciliation pass over a map. The server only asks it to sync.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { callBridge } from './wrap-bridge.js';
import { GENERATED_TOOL_CAP, META_TOOL_NAMES } from './wrap-config.js';
import { resultText } from './wrap-format.js';
import { bridgeFailure, toolError, toolSuccess } from './wrap-tool-result.js';
import { generatedToolName, wrapInputToZodShape } from './wrap-tool-schema.js';

/** What one reconciliation changed, so a caller can decide whether to notify. */
export interface GeneratedSync {
  added: number;
  removed: number;
  cap: number;
  exposed: string[];
}

/** When to use: `createWrapMcpServer` — one registry per server. */
export class GeneratedTools {
  private readonly server: McpServer;
  /** Generated tools keyed by the registered tool name. */
  private readonly registered = new Map<string, { remove(): void }>();

  constructor(server: McpServer) {
    this.server = server;
  }

  /**
   * Reconcile the generated tool set with the manifest: register `wrap_<id>` for every wrapper
   * with `exposeAsTool: true` (first 40 by id) and remove the ones that no longer qualify.
   */
  async sync(): Promise<GeneratedSync> {
    const unavailable: GeneratedSync = { added: 0, removed: 0, cap: GENERATED_TOOL_CAP, exposed: [] };

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
      if (this.registered.has(name)) continue;

      const description =
        `[wrap] ${entry.name || entry.id} — ${entry.method} ${entry.host}. ` +
        `${entry.description ? entry.description + ' ' : ''}` +
        'Typed shortcut for wrap_run; the saved request supplies the URL, headers, auth and body.';
      const tool = this.server.registerTool(
        name,
        { description, inputSchema: wrapInputToZodShape(wrapper.inputSchema) },
        async (args: any) => {
          try {
            const response = await callBridge('/wrap/run', 'POST', {
              id: entry.id,
              args: args || {},
              format: 'markdown',
            });
            const data = response.data;
            if (!data) return toolError(`No response from the wrapper bridge (HTTP ${response.status}).`);
            const text = resultText(data, 'markdown');
            return data.ok === false ? toolError(text) : toolSuccess(text);
          } catch (err: any) {
            return bridgeFailure(err);
          }
        },
      );
      this.registered.set(name, tool);
      added++;
    }

    let removed = 0;
    for (const [name, tool] of this.registered) {
      if (wanted.has(name)) continue;
      try {
        tool.remove();
      } catch {
        /* already gone */
      }
      this.registered.delete(name);
      removed++;
    }

    return { added, removed, cap: GENERATED_TOOL_CAP, exposed: exposedIds };
  }
}

// The SDK emits `tools/list_changed` itself on registerTool()/remove(), so no explicit
// notification is needed after a sync.
