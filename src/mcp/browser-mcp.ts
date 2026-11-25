import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { TIER_LABELS, TOOLS_CATALOG } from './tools-catalog.js';
import type { ToolCatalogItem } from './tools-catalog.js';
import { planToolSurface, registerCatalogTools, type ToolPreferences } from './tool-surface.js';
import { installToolSurface, registerHelpTool } from './server-surface.js';
import {
  CONSOLIDATED_HIDDEN_TOOLS,
  TOOL_GROUPS,
  type ToolGroupDefinition,
} from './tool-groups.js';
import { formatMark } from '../main/marks/format-mark.js';
import { clampText, renderMediaPreview, renderFrames, renderImageTool, renderComponentsTable } from './tool-renderers.js';
import { APP_VERSION } from '../shared/version.js';
import { BRAND } from '../shared/brand.js';
import { decisionStatus } from '../main/decide/decision-client.js';
import { registerBridgeResources } from './mcp-resources.js';
export { normalizeIncomingParams } from './normalize-params.js';
import { normalizeActionInstructions, normalizeInstructionMap } from '../shared/tool-instructions.js';

const BRIDGE_URL = process.env.HB_BRIDGE_URL || process.env.KUANG_BRIDGE_URL || 'http://127.0.0.1:4111';

// --- Diagnostics policy ------------------------------------------------------
// stdout is the JSON-RPC lifeline; stderr is diagnostics only. A client that
// pipes stderr but never drains it fills the OS pipe buffer and wedges the
// child. This server used to write ~500 bytes per tool call to stderr, so a
// normal browsing turn (~125 calls) was enough to kill the whole namespace.
// See docs/HANDOFF_ORCHA_MCP_STDERR.md.
//
//   - the file log is always written, asynchronously and memory-bounded;
//   - stderr gets a short boot banner by default and nothing per call;
//   - verbose stderr is opt-in and is backpressure-aware (lines are dropped,
//     never queued) plus hard-capped, so it can never wedge the process.
//
// Env: KUANG_MCP_LOG=0 (no file log), KUANG_MCP_STDERR=0 (no stderr),
//      KUANG_MCP_STDERR=verbose (per-call stderr, debugging only).
const LOG_TO_FILE = (process.env.HB_MCP_LOG ?? process.env.KUANG_MCP_LOG) !== '0';
const STDERR_MODE: 'off' | 'boot' | 'verbose' =
  (process.env.HB_MCP_STDERR ?? process.env.KUANG_MCP_STDERR) === '0'
    ? 'off'
    : (process.env.HB_MCP_STDERR ?? process.env.KUANG_MCP_STDERR) === 'verbose'
      ? 'verbose'
      : 'boot';
const STDERR_HARD_CAP_BYTES = 16 * 1024;

const LOG_DIR = path.resolve(process.cwd(), 'data', 'logs');
let logDirReady = false;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  logDirReady = true;
} catch {
  // Logging is best-effort; never fail startup because of it.
}

let logQueue: string[] = [];
let logFlushing = false;
const LOG_QUEUE_MAX_LINES = 2000;

function flushLogQueue(): void {
  if (!LOG_TO_FILE || !logDirReady || logFlushing || logQueue.length === 0) return;
  logFlushing = true;
  const batch = logQueue.join('');
  logQueue = [];
  fs.appendFile(path.join(LOG_DIR, 'mcp-server.log'), batch, () => {
    logFlushing = false;
    if (logQueue.length > 0) flushLogQueue();
  });
}

/** Synchronous drain used only on shutdown paths, where async I/O cannot run. */
export function flushLogSync(): void {
  if (!LOG_TO_FILE || !logDirReady || logQueue.length === 0) return;
  const batch = logQueue.join('');
  logQueue = [];
  try {
    fs.appendFileSync(path.join(LOG_DIR, 'mcp-server.log'), batch);
  } catch {
    // Ignore.
  }
}

let stderrBytesWritten = 0;
let stderrBlocked = false;

/** Bounded, non-queuing stderr write. Dropped lines are intentional. */
function writeStderr(text: string): void {
  if (STDERR_MODE === 'off' || stderrBlocked) return;
  if (stderrBytesWritten >= STDERR_HARD_CAP_BYTES) return;
  const chunk = text.endsWith('\n') ? text : `${text}\n`;
  try {
    const accepted = process.stderr.write(chunk);
    stderrBytesWritten += Buffer.byteLength(chunk);
    if (!accepted) {
      // The consumer is not reading. Stop writing instead of buffering.
      stderrBlocked = true;
      process.stderr.once('drain', () => {
        stderrBlocked = false;
      });
    }
  } catch {
    stderrBlocked = true;
  }
}

type LogLevel = 'boot' | 'call' | 'error';

function preview(value: unknown, max = 2000): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text === undefined) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function logMcp(message: string, level: LogLevel = 'call'): void {
  const timestamp = new Date().toISOString();
  if (LOG_TO_FILE) {
    if (logQueue.length >= LOG_QUEUE_MAX_LINES) logQueue.shift();
    logQueue.push(`[${timestamp}] ${message}\n`);
    flushLogQueue();
  }
  if (STDERR_MODE === 'verbose' || (STDERR_MODE === 'boot' && level !== 'call')) {
    writeStderr(`[${BRAND.browser} MCP ${timestamp}] ${message}`);
  }
}

// (clampText moved to tool-renderers; both the renderers and this dispatcher use it.)

// Ceiling on any single bridge round-trip. Generous enough for HIL waits and
// long navigations, but guarantees a wedged Cyberdeck cannot hang a tool forever.
const BRIDGE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.HB_BRIDGE_TIMEOUT_MS ?? process.env.KUANG_BRIDGE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 300_000;
})();


let cachedToolPreferences: { value: ToolPreferences; at: number } | null = null;

async function loadToolPreferences(): Promise<ToolPreferences> {
  if (cachedToolPreferences && Date.now() - cachedToolPreferences.at < 2000) {
    return cachedToolPreferences.value;
  }
  try {
    const data = await callBridge('/tools/config', 'GET');
    const order = Array.isArray(data?.order)
      ? data.order.filter((name: unknown): name is string => typeof name === 'string')
      : [];
    const disabled = Array.isArray(data?.disabled)
      ? data.disabled.filter((name: unknown): name is string => typeof name === 'string')
      : [];
    const instructions = normalizeInstructionMap(data?.instructions);
    const actionInstructions = normalizeActionInstructions(data?.actionInstructions);
    const value = {
      order,
      disabled,
      instructions,
      actionInstructions,
      jevAvailable: data?.jev?.available === true,
      jevMode: (data?.jev?.mode === 'enforce' ? 'enforce' : 'prefer') as 'prefer' | 'enforce',
    };
    cachedToolPreferences = { value, at: Date.now() };
    return value;
  } catch {
    return { order: [], disabled: [], instructions: {}, actionInstructions: {}, jevAvailable: false, jevMode: 'prefer' };
  }
}

async function callBridge(endpoint: string, method: string = 'GET', body: any = null) {
  let url = `${BRIDGE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body?.queryParams && (method === 'GET' || method === 'DELETE')) {
    const q = new URLSearchParams(body.queryParams).toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;
  } else if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, { ...options, signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS) });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(
        `Bridge request timed out after ${BRIDGE_TIMEOUT_MS}ms (${method} ${endpoint}). ` +
          `The Cyberdeck may be busy or wedged; retry or call bridge_health().`
      );
    }
    throw err;
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    const detail = errorData?.error || errorData?.message || res.statusText;
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return await res.json();
}

/**
 * Stale-server guard.
 *
 * Tool schemas and descriptions live in this bundled process, which the MCP client spawns once per
 * session. Rebuilding the app (or the bundle) does not update a running server, so an agent can end
 * up calling yesterday's schema against today's bridge — which is exactly how `target_text` and the
 * new `recipe` action looked broken during development.
 *
 * Compare once per process against the live app version and say so, loudly, on the first result.
 */
let versionCheckDone = false;
let versionNote: string | null = null;
let versionNoteShown = false;

async function versionNoteOnce(): Promise<string | null> {
  if (versionCheckDone) return versionNote;
  versionCheckDone = true;
  try {
    const health = await callBridge('/health', 'GET');
    const appVersion = String(health?.version || '');
    if (appVersion && appVersion !== APP_VERSION) {
      versionNote =
        `⚠ STALE MCP SERVER — this server is v${APP_VERSION}, the running app is v${appVersion}. ` +
        `Tool schemas and descriptions come from this process; restart the MCP client session to refresh them. ` +
        `Until then, prefer the bridge directly if a tool rejects an argument the app supports.`;
      logMcp(`[Version] MCP server v${APP_VERSION} != app v${appVersion} — stale schemas`, 'error');
    }
  } catch {
    // Bridge down or mid-restart: the normal tool error will be more useful than a version note.
  }
  return versionNote;
}

/** Names gated by Settings → Recording → "Let agents use the recording tools". */
const RECORDING_TOOL_NAMES = new Set(['record_start', 'record_stop', 'list_recordings']);

/** Short probe; a bridge that is down must not hide tools (it may start later). */
async function recordingToolsAllowed(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE_URL}/recording/status`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return true;
    const data: any = await res.json();
    return data?.toolsEnabled !== false;
  } catch {
    return true;
  }
}

/** Tools whose response carries a native image part (see the Phase-3 screenshot merge). */
const IMAGE_TOOLS = new Set([
  'take_screenshot',
  'take_annotated_screenshot',
  'take_economy_screenshot',
  'list_marks',
]);

async function executeCatalogTool(tool: ToolCatalogItem, args: any) {
  try {
    logMcp(`[Tool Dispatch] "${tool.name}" with args: ${preview(args)}`);
    const body = tool.payload ? tool.payload(args) : args;
    const endpoint = tool.endpointFor ? tool.endpointFor(args) : tool.endpoint;
    logMcp(`[HTTP Forward] ${tool.method || 'POST'} ${endpoint} body: ${preview(body)}`);
    const data = await callBridge(endpoint, tool.method || 'POST', body);

    // Frame inventory: text summary plus one image per visible frame. Handled before the
    // single-image branch because an iframe result is inherently multi-image.
    if (tool.name === 'media_preview') {
      const rendered = renderMediaPreview(tool, data, args);
      logMcp(`[Tool Success] "media_preview" returning text + ${(Array.isArray(data?.images) ? data.images : []).length} image(s)`);
      return rendered;
    }

    if (tool.name === 'frames') {
      const rendered = renderFrames(tool, data, args);
      logMcp(`[Tool Success] "frames" returning text + ${(Array.isArray(data?.images) ? data.images : []).length} frame image(s)`);
      return rendered;
    }

    // Image-bearing tools: plain viewport screenshots and Set-of-Marks scans.
    if (IMAGE_TOOLS.has(tool.name)) {
      const rendered = renderImageTool(tool, data, args);
      const marks = Array.isArray(data.marks) ? data.marks : [];
      logMcp(`[Tool Success] "${tool.name}" rendered with ${marks.length} marks`);
      return rendered;
    }

    const rawText = tool.format
      ? tool.format(data, args)
      : typeof data === 'string'
        ? data
        : JSON.stringify(data, null, 2);
    const text = clampText(typeof rawText === 'string' ? rawText : String(rawText ?? ''));
    logMcp(`[Tool Success] "${tool.name}" result: ${text.slice(0, 100)}`);

    // A stale server silently rejects arguments the app already supports; say so once.
    let outputText = text;
    const staleNote = await versionNoteOnce();
    if (staleNote && !versionNoteShown) {
      versionNoteShown = true;
      outputText = `${staleNote}\n\n${text}`;
    }

    // observe(as:"components") is the input to the decision loop, so hand back the machine
    // table too — decide(state: <this>, guard:{components: [ids]}) can consume it verbatim
    // instead of the agent re-typing ids out of the prose projection.
    if (tool.name === 'observe' && data?.as === 'components' && Array.isArray(data.components)) {
      return renderComponentsTable(text, data);
    }

    return { content: [{ type: 'text', text: outputText }] };
  } catch (err: any) {
    logMcp(`[Tool Error] "${tool.name}": ${err?.message || err}`, 'error');
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `[Hypagon Browser MCP Error] ${err?.message || err}. (Ensure Cyberdeck is running at ${BRIDGE_URL})`,
        },
      ],
    };
  }
}

function registerToolGroup(
  server: McpServer,
  group: ToolGroupDefinition,
  preferences: ToolPreferences,
): void {
  const actions = group.actions.map((action) => action.action) as [string, ...string[]];
  const actionList = group.actions
    .map((action) => {
      const custom = preferences.actionInstructions?.[group.name]?.[action.action];
      return `${action.action} (${custom || action.description})`;
    })
    .join('; ');
  const tier = group.tier;
  const prefix = tier ? `[${TIER_LABELS[tier]}] ` : '';
  server.registerTool(
    group.name,
    {
      description: `${prefix}${group.description} Actions: ${actionList}`,
      inputSchema: z.object({ action: z.enum(actions) }).passthrough(),
    },
    async (args: any): Promise<any> => {
      const action = group.actions.find((entry) => entry.action === args?.action);
      if (!action) {
        return { isError: true, content: [{ type: 'text', text: `Unknown action "${args?.action}". Use one of: ${group.actions.map((entry) => entry.action).join(', ')}` }] };
      }
      const { action: _action, ...rest } = args || {};
      const mapped = action.map ? action.map(rest) : rest;
      if (action.endpoint) {
        try {
          const data = await callBridge(action.endpoint, action.method || 'POST', mapped);
          return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
        } catch (error: any) {
          return {
            isError: true,
            content: [{ type: 'text', text: `[Hypagon Browser MCP Error] ${error?.message || error}` }],
          };
        }
      }
      const target = TOOLS_CATALOG.find((tool) => tool.name === action.tool);
      if (!target) {
        return { isError: true, content: [{ type: 'text', text: `Action "${action.action}" is unavailable.` }] };
      }
      return executeCatalogTool(target, mapped);
    },
  );
}

export async function createBridgeMcpServer() {
  const server = new McpServer({
    name: 'hb-browser',
    version: APP_VERSION,
  });

  // The recording tools are gated by a human-only switch in Settings → Recording. Probe the
  // bridge once at startup: when the switch is off, they are not registered at all (so they
  // cannot appear in tools/list). The bridge routes refuse them too, which covers sessions
  // that were already connected when the switch was flipped.
  const recordingToolsAvailable = await recordingToolsAllowed();
  if (!recordingToolsAvailable) {
    logMcp('[Recording] Tools are disabled by the human-only switch; not registering them.', 'boot');
  }

  const decisionConfigured = decisionStatus().configured;
  const toolPreferences = await loadToolPreferences();
  const plan = planToolSurface(toolPreferences, decisionConfigured);

  registerCatalogTools(server, plan, toolPreferences, {
    recordingToolsAvailable,
    execute: (tool, args) => executeCatalogTool(tool, args),
  });

  for (const group of TOOL_GROUPS) {
    if (plan.disabledTools.has(group.name)) continue;
    registerToolGroup(server, group, toolPreferences);
  }

  registerBridgeResources(server, { jevActive: plan.jevActive, jevEnforced: plan.jevEnforced });
  registerHelpTool(server, { jevActive: plan.jevActive, jevEnforced: plan.jevEnforced });

  // Reshape tools/list (drop deprecated aliases) and normalize tools/call arguments.
  installToolSurface(server, {
    surfaceOrder: plan.surfaceOrder,
    hiddenTools: plan.hiddenTools,
    log: (message) => logMcp(message),
    preview: (value) => preview(value),
  });

  return server;
}
