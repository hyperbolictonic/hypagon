/**
 * System and human-control routes.
 *
 * Health, the tool-config handshake, metrics and explicit takeover live here. They
 * are the only routes that answer while a person holds the wheel, because the deck
 * must be able to render the RESUME control.
 *
 * The `ROUTES` table is the single source of truth: the handler dispatches from its
 * keys, and the MCP/bridge contract test reads the same keys statically.
 */

import { BRAND } from '../../../shared/brand.js';
import { APP_VERSION } from '../../../shared/version.js';
import { decisionStatus } from '../../decide/decision-client.js';
import { shadowWalkStatus } from '../../shadow-walk/settings.js';
import { resetMetrics, snapshot, summary } from '../../metrics.js';
import { DEFAULT_TOOL_SETTINGS } from '../../tools/settings.js';
import type { BridgeContext } from '../context.js';

type Handler = (ctx: BridgeContext) => Promise<void>;

/** Health and page-info share one payload; clients use either name. */
function healthPayload(ctx: BridgeContext): Record<string, unknown> {
  const info = ctx.chassis.getPageInfo();
  return {
    status: 'ok',
    app: BRAND.appKey,
    version: APP_VERSION,
    revision: ctx.chassis.getRevision(),
    capabilities: ctx.chassis.getCapabilities(),
    decision: decisionStatus(),
    lastActionAt: ctx.lastActionAt,
    window: { visible: ctx.chassis.isWindowVisible(), focused: ctx.chassis.isWindowFocused() },
    input: { transport: ctx.chassis.getSimulator().lastInputTransport },
    human: { paused: ctx.chassis.isHumanActive(), ...ctx.chassis.getHumanStatus() },
    metrics: summary(),
    shadowWalk: { ...shadowWalkStatus(), forceOpenArmed: ctx.chassis.forceOpenArmed() },
    zoom: ctx.chassis.getZoomState(),
    info,
  };
}

const ROUTES: Record<string, Handler> = {
  'GET /health': async (ctx) => {
    ctx.json(healthPayload(ctx));
  },

  'GET /page-info': async (ctx) => {
    ctx.json(healthPayload(ctx));
  },

  'GET /tools/config': async (ctx) => {
    const settings = ctx.toolSettings?.load() ?? DEFAULT_TOOL_SETTINGS;
    // JEV availability is live bridge state, not a saved preference: the MCP server reads it
    // to lead tools/list with the index/read path and to mark the full-page dump as a fallback.
    const policy = ctx.chassis.jevSurface.getJevPolicy();
    ctx.json({
      success: true,
      ...settings,
      jev: { available: policy.available, mode: policy.enforce ? 'enforce' : 'prefer' },
    });
  },

  'GET /metrics': async (ctx) => {
    ctx.json({ success: true, version: APP_VERSION, counters: snapshot() });
  },

  'POST /metrics/reset': async (ctx) => {
    ctx.json({ success: true, ...resetMetrics() });
  },

  'GET /human/status': async (ctx) => {
    ctx.json({ success: true, ...ctx.chassis.getHumanStatus() });
  },

  'POST /human/takeover': async (ctx) => {
    ctx.json({ success: true, ...ctx.chassis.takeOverHuman() });
  },

  'POST /human/resume': async (ctx) => {
    ctx.json({ success: true, ...ctx.chassis.resumeHuman() });
  },
};

/**
 * When to use: the request is a health/config/metrics/human-control call. These are
 * exact paths with no prefix; unknown paths fall through to the other families.
 */
export async function handleSystemRoutes(ctx: BridgeContext): Promise<boolean> {
  const handler = ROUTES[`${ctx.method} ${ctx.pathname}`];
  if (!handler) return false;
  await handler(ctx);
  return true;
}
