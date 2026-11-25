/**
 * The bridge's error-to-HTTP mapping.
 *
 * Why a module: the catch block is the one place that decides whether a thrown
 * error is the agent's fault (400), a missing gate (409), a rate limit (429) or
 * an internal fault (500). Two codes carry extra detail (`JEV_REQUIRED`,
 * `SEALED_RATE_LIMITED`); the rest share one body. Keeping the table here makes
 * the status decision auditable instead of buried in the request handler.
 */
import type { RouteTableContext } from './route-table.js';

/** Codes the client can fix by changing its request, so they answer 400 rather than 500. */
const CLIENT_ERROR_CODES = new Set([
  'BAD_REQUEST',
  'STALE_REF',
  'NO_TARGET',
  'NOT_SUPPORTED',
  'TIMEOUT',
  'NO_LLM_SURFACE',
  'FETCH_BLOCKED',
  'SHADOW_WALK_DISABLED',
  'SEALED_DISABLED',
  'TAB_WALK_DISABLED',
  'FRAMES_DISABLED',
  'DEEP_OPEN_ROOTS_DISABLED',
]);

/**
 * When to use: the bridge's catch block — translate a thrown error into the
 * shared `{ success:false, error, code }` body with the matching status.
 */
export function sendBridgeError(err: any, sendJson: RouteTableContext['sendJson']): void {
  const code = err?.code || 'INTERNAL';
  if (code === 'JEV_REQUIRED') {
    const detail = err?.detail && typeof err.detail === 'object' ? err.detail : {};
    sendJson(
      {
        success: false,
        error: err?.message || 'Unscoped page reads are disabled while JEV enforce is on.',
        code,
        ...detail,
      },
      409,
    );
    return;
  }
  if (code === 'SEALED_RATE_LIMITED') {
    sendJson(
      {
        success: false,
        error: err?.message || 'Sealed discovery is rate-limited.',
        code,
        retry_after: Math.max(1, Math.ceil(Number(err?.retryAfterMs || 0) / 1000)),
      },
      429,
    );
    return;
  }
  const client = CLIENT_ERROR_CODES.has(code) || code.startsWith('NAVIGATION_');
  sendJson({ success: false, error: err?.message || String(err), code }, client ? 400 : 500);
}
