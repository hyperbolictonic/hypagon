/**
 * The bridge's health, telemetry and human-control routes.
 *
 * Why one module: every route here answers a question about the bridge itself
 * rather than the page — liveness, version, counters, the human-control latch,
 * notifications and the decision-event log. They share the same read-mostly
 * shape and the same collaborators (metrics, shadow-walk status, the tool
 * settings store, the last-action clock), so the main handler can stay a
 * dispatcher instead of growing a second status surface.
 */
import { APP_VERSION } from '../../shared/version.js';
import { BRAND } from '../../shared/brand.js';
import { shadowWalkStatus } from '../shadow-walk/settings.js';
import { decisionStatus } from '../decide/decision-client.js';
import { summary, snapshot, resetMetrics } from '../metrics.js';
import { DEFAULT_TOOL_SETTINGS, type ToolSettingsStore } from '../tools/settings.js';
import type { ChassisRouteContext } from './route-table.js';
import { dispatchRoute } from './route-table.js';

/**
 * When to use: the bridge request handler — the health family also needs the
 * tool settings (optional when the bridge starts without a store) and the
 * lazily-read last-action timestamp.
 */
export interface HealthRouteContext extends ChassisRouteContext {
  /** Tool preferences; absent in tests that start the bridge without a store. */
  toolSettings?: ToolSettingsStore;
  /** Timestamp of the last mutating action, read when `/health` is served. */
  lastActionAt: () => number;
}

type HealthHandler = (ctx: HealthRouteContext) => Promise<void> | void;

/** `/health` and its `/page-info` alias answer with the same full snapshot. */
const bridgeStatus = (ctx: HealthRouteContext) => {
  const { chassis, lastActionAt } = ctx;
  const info = chassis.getPageInfo();
  return {
    status: 'ok',
    app: BRAND.appKey,
    version: APP_VERSION,
    revision: chassis.getRevision(),
    capabilities: chassis.getCapabilities(),
    decision: decisionStatus(),
    lastActionAt: lastActionAt(),
    window: { visible: chassis.isWindowVisible(), focused: chassis.isWindowFocused() },
    input: { transport: chassis.input.simulator.lastInputTransport },
    human: { paused: chassis.isHumanActive(), ...chassis.getHumanStatus() },
    metrics: summary(),
    shadowWalk: { ...shadowWalkStatus(), forceOpenArmed: chassis.shadow.forceOpenArmed() },
    zoom: chassis.zoom.getState(),
    info,
  };
};

const ROUTES: Record<string, HealthHandler> = {
  'GET /health': (ctx) => ctx.sendJson(bridgeStatus(ctx)),

  'GET /page-info': (ctx) => ctx.sendJson(bridgeStatus(ctx)),

  'GET /tools/config': ({ chassis, toolSettings, sendJson }) => {
    const settings = toolSettings?.load() ?? DEFAULT_TOOL_SETTINGS;
    // JEV availability is live bridge state, not a saved preference: the MCP server reads it
    // to lead tools/list with the index/read path and to mark the full-page dump as a fallback.
    const policy = chassis.jev.getPolicy();
    sendJson({
      success: true,
      ...settings,
      jev: { available: policy.available, mode: policy.enforce ? 'enforce' : 'prefer' },
    });
  },

  'GET /metrics': ({ sendJson }) => {
    sendJson({ success: true, version: APP_VERSION, counters: snapshot() });
  },

  'POST /metrics/reset': ({ sendJson }) => {
    sendJson({ success: true, ...resetMetrics() });
  },

  'GET /human/status': ({ chassis, sendJson }) => {
    sendJson({ success: true, ...chassis.getHumanStatus() });
  },

  'POST /human/takeover': ({ chassis, sendJson }) => {
    sendJson({ success: true, ...chassis.takeOverHuman() });
  },

  'POST /human/resume': ({ chassis, sendJson }) => {
    sendJson({ success: true, ...chassis.resumeHuman() });
  },

  'POST /notify': async ({ chassis, readBody, sendJson }) => {
    const body = await readBody();
    const sent = chassis.hil.notify(body.title, body.message, body.urgency, body.sound);
    sendJson({ success: true, sent });
  },

  'GET /decisions': ({ chassis, sendJson }) => {
    const decisions = chassis.getDecisionEvents();
    sendJson({ success: true, count: decisions.length, decisions });
  },
};

/**
 * When to use: the bridge request handler — dispatch the health, telemetry and
 * human-control routes. Returns false when the method+path pair is not served
 * here. None of these paths overlap another family, so dispatch order is free.
 */
export async function handleHealthRoutes(ctx: HealthRouteContext): Promise<boolean> {
  return dispatchRoute(ROUTES, ctx, (handler) => handler(ctx));
}
