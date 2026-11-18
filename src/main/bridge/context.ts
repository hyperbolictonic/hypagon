/**
 * Shared bridge request context.
 *
 * `http-bridge.ts` owns the HTTP server and the cross-cutting policy (CORS, human
 * control, logging, error mapping). Route families live in `routes/` and receive
 * this context so they never re-implement body reading or the response envelope.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BrowserChassis } from '../browser-chassis.js';
import type { CollaborationService } from '../collaboration/service.js';
import type { MediaService } from '../media/service.js';
import type { SecretStore } from '../wrap/secrets.js';
import type { WrapAuditLog } from '../wrap/audit.js';
import type { WrapCore } from '../wrap/core.js';
import type { WrapStore } from '../wrap/store.js';
import type { ToolSettingsStore } from '../tools/settings.js';

/** When to use: wire the optional REST/wrap, media, collaboration and settings services into the bridge. */
export interface WrapBridge {
  store: WrapStore;
  executor: WrapCore;
  secrets: SecretStore;
  audit: WrapAuditLog;
  /** Rotated on each app start; the MCP side reads it from `HB_WRAP_TOKEN_FILE` (legacy `KUANG_WRAP_TOKEN_FILE`). */
  token: string;
}

/** When to use: pass the long-lived services a route family may need. */
export interface BridgeDeps {
  chassis: BrowserChassis;
  wrap?: WrapBridge;
  toolSettings?: ToolSettingsStore;
  collaboration?: CollaborationService;
  media?: MediaService;
}

/** When to use: handle one parsed request; return true when the route family answered it. */
export type BridgeHandler = (ctx: BridgeContext) => boolean | Promise<boolean>;

/** When to use: read request fields and answer without touching `req`/`res` directly. */
export interface BridgeContext extends BridgeDeps {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  pathname: string;
  /** Epoch milliseconds when the request arrived; `json()` reports the duration. */
  startedAt: number;
  /** Parsed JSON body, or `{}` for an empty, raw or non-JSON body. */
  body: <T = any>() => Promise<T>;
  /** Write a JSON response and log it. */
  json: (data: any, status?: number) => void;
  /** Write the standard `{ success: false, error, code }` envelope. */
  fail: (message: string, status?: number, code?: string) => void;
}
