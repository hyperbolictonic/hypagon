/**
 * The ordered bridge family table.
 *
 * Why a module: the main handler used to list every family inline, which made
 * the request lifecycle hard to read and left the ordering rule implicit. Each
 * family owns a disjoint method+path set, so this table is now the single place
 * that says which families exist and in what order they are tried.
 */
import type { ToolSettingsStore } from '../tools/settings.js';
import type { CollaborationService } from '../collaboration/service.js';
import type { MediaService } from '../media/service.js';
import type { ChassisRouteContext } from './route-table.js';
import { handleHealthRoutes } from './health-routes.js';
import { handleMediaRoutes } from './media-routes.js';
import { handleCollaborationRoutes } from './collaboration-routes.js';
import { handleNavRoutes } from './nav-routes.js';
import { handleReadRoutes } from './read-routes.js';
import { handleJevRoutes } from './jev-routes.js';
import { handleRecordingRoutes } from './recording-routes.js';
import { handleSessionRoutes } from './session-routes.js';
import { handleNetworkRoutes } from './network-routes.js';
import { handleMarkRoutes } from './marks-routes.js';
import { handleScriptRoutes } from './scripts-routes.js';
import { handleWorkspaceRoutes } from './workspace-routes.js';
import { handleTabRoutes } from './tabs-routes.js';
import { handleCortexRoutes } from './cortex-routes.js';
import { handleBookmarkRoutes } from './bookmarks-routes.js';
import { handleHumanInterventionRoutes } from './hil-routes.js';
import { handleWindowRoutes } from './window-routes.js';
import { handlePrimitiveRoutes } from './primitives-routes.js';
import { handleDecisionRoutes } from './decision-routes.js';
import { handleResearchRoutes } from './research-routes.js';
import { handleWrapRoutes, type WrapBridge } from './wrap-routes.js';

/** When to use: wiring the bridge dispatcher — every optional service plus the last-action clock. */
export interface BridgeDispatchContext extends ChassisRouteContext {
  /** Tool preferences; absent in tests that start the bridge without a store. */
  toolSettings?: ToolSettingsStore;
  collaboration?: CollaborationService;
  media?: MediaService;
  wrap?: WrapBridge;
  /** Raw request headers; only the wrap family reads them (bearer token). */
  headers: Record<string, string | string[] | undefined>;
  /** Timestamp of the last mutating action, read by health and network correlation. */
  lastActionAt: () => number;
}

type FamilyHandler = (ctx: BridgeDispatchContext) => Promise<boolean>;

/** Disjoint path sets, so order is free; kept in request-lifecycle reading order. */
const FAMILIES: FamilyHandler[] = [
  handleHealthRoutes,
  handleMediaRoutes,
  handleCollaborationRoutes,
  handleNavRoutes,
  handleReadRoutes,
  handleJevRoutes,
  handleRecordingRoutes,
  handleSessionRoutes,
  handleNetworkRoutes,
  handleMarkRoutes,
  handleScriptRoutes,
  handleWorkspaceRoutes,
  handleTabRoutes,
  handleCortexRoutes,
  handleBookmarkRoutes,
  handleHumanInterventionRoutes,
  handleWindowRoutes,
  handlePrimitiveRoutes,
  handleDecisionRoutes,
  handleResearchRoutes,
  handleWrapRoutes,
];

/**
 * When to use: the bridge request handler — run the family table until one
 * claims the request. Returns false when no family serves this method+path.
 */
export async function dispatchBridgeRoutes(ctx: BridgeDispatchContext): Promise<boolean> {
  for (const family of FAMILIES) {
    if (await family(ctx)) return true;
  }
  return false;
}
