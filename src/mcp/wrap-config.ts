/**
 * Environment and bridge transport for the Hypagon REST MCP server.
 *
 * Everything here is read from the process environment once at boot: the bridge URL, the
 * request timeout, the token source, and the generated-tool cap. `callBridge` is the only
 * way this server talks to the app — it is stateless, so every tool call is one request.
 *
 * When to use: the server factory and the generated-tool registry. Nothing here touches MCP.
 */
import fs from 'node:fs';

/** When to use: addressing the Cyberdeck bridge (no trailing slash). */
export const BRIDGE_URL = (process.env.HB_BRIDGE_URL || process.env.KUANG_BRIDGE_URL || 'http://127.0.0.1:4111').replace(/\/$/, '');

/** When to use: bounding one bridge request (default 90 s). */
export const BRIDGE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.HB_WRAP_TIMEOUT_MS ?? process.env.KUANG_WRAP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 90_000;
})();

const TOKEN_FILE = process.env.HB_WRAP_TOKEN_FILE || process.env.KUANG_WRAP_TOKEN_FILE || '';
const STATIC_TOKEN =
  process.env.HB_WRAP_TOKEN ||
  process.env.KUANG_WRAP_TOKEN ||
  process.env.HB_BRIDGE_TOKEN ||
  process.env.KUANG_BRIDGE_TOKEN ||
  '';

/**
 * How many generated `wrap_<id>` tools may be registered at once. This is a model-context
 * budget, not an MCP limit (the protocol has no tool cap). `HB_WRAP_MAX_TOOLS=0` disables
 * generated tools entirely; the ten meta-tools keep working.
 */
export const GENERATED_TOOL_CAP = (() => {
  const raw = Number(process.env.HB_WRAP_MAX_TOOLS ?? process.env.KUANG_WRAP_MAX_TOOLS);
  if (!Number.isFinite(raw) || raw < 0) return 40;
  return Math.min(Math.floor(raw), 200);
})();

/** Names the static meta-tools own; a generated name must never collide with one. */
export const META_TOOL_NAMES: readonly string[] = [
  'wrap_list',
  'wrap_get',
  'wrap_derive',
  'wrap_secret_list',
  'wrap_create',
  'wrap_update',
  'wrap_delete',
  'wrap_run',
  'wrap_test',
  'wrap_reload',
];

function currentWrapToken(): string {
  if (STATIC_TOKEN) return STATIC_TOKEN.trim();
  if (!TOKEN_FILE) return '';
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

/** When to use: the shape `callBridge` resolves — HTTP status plus parsed JSON (or an error). */
export interface BridgeResponse {
  ok: boolean;
  status: number;
  data: any;
}

/** When to use: every tool call — one authenticated request to the local bridge. */
export async function callBridge(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<BridgeResponse> {
  const token = currentWrapToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
  };
  if (body !== undefined && method === 'POST') init.body = JSON.stringify(body);

  let response: Response;
  try {
    response = await fetch(`${BRIDGE_URL}${endpoint}`, init);
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`Bridge request timed out after ${BRIDGE_TIMEOUT_MS} ms (${method} ${endpoint}).`);
    }
    throw new Error(`Cannot reach the Cyberdeck bridge at ${BRIDGE_URL}. Is the app running? (${err?.message || err})`);
  }

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 1_000), code: 'BAD_RESPONSE' };
    }
  }

  if (response.status === 401) {
    throw new Error(
      token
        ? 'The Cyberdeck rejected the Hypagon REST bridge token. An app restart rotates it; restart the MCP client or update HB_WRAP_TOKEN_FILE.'
        : 'Hypagon REST needs a bridge token. Add HB_WRAP_TOKEN_FILE to this server’s config (Settings → MCP Clients → REST wrappers).',
    );
  }

  return { ok: response.ok, status: response.status, data };
}
