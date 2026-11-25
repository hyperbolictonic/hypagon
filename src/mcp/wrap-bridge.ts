/**
 * The one way this server talks to the app: a JSON request to the bridge with the wrap token.
 *
 * Why a module: every tool is one bridge call, and the failure text (unreachable, timed out,
 * rejected token) has to read the same whichever tool hit it.
 */
import fs from 'node:fs';
import { BRIDGE_TIMEOUT_MS, BRIDGE_URL, STATIC_TOKEN, TOKEN_FILE } from './wrap-config.js';
import { errorText } from './wrap-messages.js';

/** What a bridge call produced, including the parsed body. */
export interface BridgeResponse {
  ok: boolean;
  status: number;
  data: any;
}

/** The wrap token: the explicit one, else the file the app rotates. */
export function currentWrapToken(): string {
  if (STATIC_TOKEN) return STATIC_TOKEN.trim();
  if (!TOKEN_FILE) return '';
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch {
    return '';
  }
}

/** When to use: any tool — one request to the bridge, with the standard failures. */
export async function callBridge(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<BridgeResponse> {
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

/**
 * The failure text for a non-ok bridge response; every wrap tool reports it the same way.
 */
export function bridgeError(response: BridgeResponse): string | undefined {
  return response.ok ? undefined : errorText(response.data?.code, response.data?.error || `HTTP ${response.status}`);
}
