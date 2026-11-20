/**
 * The browser MCP surface: bridge access, tool preferences, and turning a catalog tool's
 * bridge response into MCP content.
 *
 * Screenshot-like tools return a text summary plus a native image part; everything else is
 * text (clamped) and, for `observe(as:"components")`, the machine table the decision loop
 * consumes. A stale server (bundle older than the app) says so once, on the first result.
 */
import { formatMark } from './format-mark.js';
import type { ToolCatalogItem } from './tools-catalog.js';
import { APP_VERSION } from '../shared/version.js';
import { BRIDGE_URL, logMcp, preview } from './mcp-log.js';

// Hard ceiling on any single text tool response so one oversized payload can neither flood the
// client context nor wedge the stdio transport.
const MAX_TEXT_CHARS = 60000;
/** When to use: any text tool result — keeps one response inside the agent context budget. */
export function clampText(text: string): string {
  if (typeof text !== 'string' || text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n... [Hypagon Browser MCP: response truncated at ${MAX_TEXT_CHARS} chars to protect the agent context. Narrow the query (e.g. query_json_data path/projection) for a smaller result.]`;
}

// Ceiling on any single bridge round-trip. Generous enough for HIL waits and long navigations,
// but guarantees a wedged Cyberdeck cannot hang a tool forever.
const BRIDGE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.HB_BRIDGE_TIMEOUT_MS ?? process.env.KUANG_BRIDGE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 300_000;
})();

/** When to use: every tool call — one JSON request to the local bridge with a hard timeout. */
export async function callBridge(endpoint: string, method: string = 'GET', body: any = null) {
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
          `The Cyberdeck may be busy or wedged; retry or call bridge_health().`,
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
 * Tool schemas and descriptions live in this bundled process, which the MCP client spawns once
 * per session. Rebuilding the app (or the bundle) does not update a running server, so an agent
 * can end up calling yesterday's schema against today's bridge. Compare once per process and
 * say so, loudly, on the first result.
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

function extractCleanBase64(data: any): string {
  const raw = data?.screenshot?.base64Image || data?.base64Image || data?.image || '';
  return typeof raw === 'string' ? raw.replace(/^data:image\/[a-z]+;base64,/, '') : '';
}

/** Names gated by Settings → Recording → "Let agents use the recording tools". */
/** When to use: gating the recording tools on the human-only Settings switch. */
export const RECORDING_TOOL_NAMES = new Set(['record_start', 'record_stop', 'list_recordings']);

/** Short probe; a bridge that is down must not hide tools (it may start later). */
/** When to use: deciding whether the recording tools may appear in tools/list. */
export async function recordingToolsAllowed(): Promise<boolean> {
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
/** When to use: deciding whether a tool result carries a native image part. */
export const IMAGE_TOOLS = new Set([
  'take_screenshot',
  'take_annotated_screenshot',
  'take_economy_screenshot',
  'list_marks',
]);

/** When to use: a tool whose payload is one or more images (media preview, frames, screenshots). */
function imageToolContent(tool: ToolCatalogItem, data: any, args: any): { content: any[] } | null {
  // Frame inventory: text summary plus one image per visible frame. Handled before the
  // single-image branch because an iframe result is inherently multi-image.
  if (tool.name === 'media_preview') {
    const text = clampText(tool.format ? tool.format(data, args) : JSON.stringify(data, null, 2));
    const content: any[] = [{ type: 'text', text }];
    const images = Array.isArray(data?.images) ? data.images : [];
    for (const image of images) {
      if (typeof image?.base64 !== 'string' || image.base64 === '') continue;
      content.push({ type: 'image', data: image.base64, mimeType: image.mimeType || 'image/jpeg' });
    }
    logMcp(`[Tool Success] "media_preview" returning text + ${images.length} image(s)`);
    return { content };
  }

  if (tool.name === 'frames') {
    const images = Array.isArray(data?.images) ? data.images : [];
    const text = clampText(tool.format ? tool.format(data, args) : JSON.stringify(data, null, 2));
    const content: any[] = [{ type: 'text', text }];
    for (const image of images) {
      const raw = typeof image?.base64Image === 'string' ? image.base64Image.replace(/^data:image\/[a-z]+;base64,/, '') : '';
      if (!raw) continue;
      content.push({
        type: 'text',
        text: `Frame image — ${image.name ? `"${image.name}" ` : ''}${image.url || image.frameId} (${image.width}x${image.height})`,
      });
      content.push({ type: 'image', data: raw, mimeType: image.mimeType || 'image/jpeg' });
    }
    logMcp(`[Tool Success] "frames" returning text + ${images.length} frame image(s)`);
    return { content };
  }

  // Image-bearing tools: plain viewport screenshots and Set-of-Marks scans. After the Phase-3
  // merge these funnel through take_screenshot (legacy names remain hidden aliases), so branch
  // on the target, not the name.
  if (IMAGE_TOOLS.has(tool.name)) {
    const rawBase64 = extractCleanBase64(data);
    const screenshot = data.screenshot || data;
    const filePath = screenshot.filePath || '';
    const w = screenshot.width || 0;
    const h = screenshot.height || 0;
    const marks = Array.isArray(data.marks) ? data.marks : [];
    const withMarks = tool.name !== 'take_screenshot' || args?.marks === true;
    const zoom = screenshot.zoom;
    const zoomNote = zoom
      ? ` Page zoom ${Math.round((zoom.factor || 1) * 100)}% (${zoom.custom ? 'custom' : zoom.mode}); CSS viewport ${zoom.viewport?.css?.width || 0}x${zoom.viewport?.css?.height || 0}; image/CSS scale ${Number(screenshot.coordinateScale || 1).toFixed(3)}.`
      : '';

    let text: string;
    if (withMarks) {
      const marksTable = marks.map((m: any) => formatMark(m)).join('\n');
      const header = filePath
        ? `Set-of-Marks Screenshot saved to ${filePath} (${w}x${h}px). ${marks.length} interactive elements detected.${zoomNote}`
        : `Set-of-Marks text scan (viewport ${w}x${h}px, no image). ${marks.length} interactive elements detected.${zoomNote}`;
      text = clampText(`${header}\n\nInteractive Elements:\n${marksTable}\n\nActuate via act(mark_id, action) — action defaults to "click"; "type" for inputs (text=...), "hover" for menus, "press" for keys.`);
    } else {
      text = filePath
        ? `Screenshot captured and saved to ${filePath} (${w}x${h}px).${zoomNote}`
        : `Screenshot captured (${w}x${h}px).${zoomNote}`;
    }

    const content: any[] = [{ type: 'text', text }];
    if (rawBase64) {
      content.push({
        type: 'image',
        data: rawBase64,
        mimeType: screenshot.mimeType || (filePath.endsWith('.png') ? 'image/png' : 'image/jpeg'),
      });
    }
    logMcp(`[Tool Success] "${tool.name}" returning text${rawBase64 ? ' + image part' : ' only'} (${rawBase64.length} chars base64, ${marks.length} marks, path: ${filePath})`);
    return { content };
  }

  return null;
}

/** When to use: every catalog tool and grouped action — dispatch, shape content, map errors. */
export async function executeCatalogTool(tool: ToolCatalogItem, args: any) {
  try {
    logMcp(`[Tool Dispatch] "${tool.name}" with args: ${preview(args)}`);
    const body = tool.payload ? tool.payload(args) : args;
    const endpoint = tool.endpointFor ? tool.endpointFor(args) : tool.endpoint;
    logMcp(`[HTTP Forward] ${tool.method || 'POST'} ${endpoint} body: ${preview(body)}`);
    const data = await callBridge(endpoint, tool.method || 'POST', body);

    const image = imageToolContent(tool, data, args);
    if (image) return image;

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
    // table too — decide(state: <this>, guard:{components: [ids]}) can consume it verbatim.
    if (tool.name === 'observe' && data?.as === 'components' && Array.isArray(data.components)) {
      const components = data.components.slice(0, 120).map((c: any) => ({
        id: c.id, role: c.role, name: c.name, actions: c.actions,
      }));
      return {
        content: [
          { type: 'text', text },
          { type: 'text', text: JSON.stringify({ components }) },
        ],
      };
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
