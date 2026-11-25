/**
 * The one tool-call envelope every wrap tool answers with: call the bridge, name the failure, or
 * render the payload — and turn a thrown fetch into the same error shape.
 *
 * Why a module: nine copies of this skeleton had started drifting, and the text cap must apply to
 * both the success and the failure path.
 */
import { MAX_TEXT_CHARS } from './wrap-config.js';
import type { BridgeResponse } from './wrap-bridge.js';
import { logWrap } from './wrap-log.js';

/** A response longer than the cap is truncated with a hint to narrow it. */
export function clampText(text: string): string {
  if (typeof text !== 'string' || text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n\n... [Hypagon REST: response truncated at ${MAX_TEXT_CHARS} chars. Use format "json" with a narrower path or a recipe cap.]`;
}

/** The MCP success shape. */
export function toolSuccess(text: string) {
  return { content: [{ type: 'text' as const, text: clampText(text) }] };
}

/** The MCP failure shape. */
export function toolError(text: string) {
  return { isError: true, content: [{ type: 'text' as const, text: clampText(text) }] };
}

/** A thrown bridge failure, logged and returned in the standard error shape. */
export function bridgeFailure(err: any) {
  logWrap(`Bridge error: ${err?.message || err}`, 'error');
  return toolError(`[Hypagon REST] ${err?.message || err}`);
}

/**
 * When to use: every wrap tool body — call the bridge, let `fail` name the failure text (or
 * return undefined to proceed), render the success payload, and wrap a thrown bridge failure.
 */
export async function bridgeTool(
  action: () => Promise<BridgeResponse>,
  fail: (response: BridgeResponse) => string | undefined,
  render: (data: any) => string | Promise<string>,
) {
  try {
    const response = await action();
    const message = fail(response);
    if (message !== undefined) return toolError(message);
    return toolSuccess(await render(response.data));
  } catch (err: any) {
    return bridgeFailure(err);
  }
}
