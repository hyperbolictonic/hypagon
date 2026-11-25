/**
 * Interaction stack.
 *
 * Builds the human-in-the-loop surface, the append-only action ledger and the
 * orthogonal primitives layer. The primitives borrow the chassis's real input,
 * marks and harvest plumbing so they stay on the humanlike path; the host
 * contract supplies those surfaces without a copied deps literal.
 */
import { activeWebContents, currentRevision, pageInfo } from './accessors.js';
import type { WebContents } from 'electron';
import { HilSurface } from '../hil/hil-surface.js';
import { ActionLedger } from '../telemetry/action-ledger.js';
import { Primitives } from '../primitives/primitives.js';
import { resolveFrameMark } from '../browser/frame-marks.js';
import { resolveSealedToken } from '../shadow-walk/sealed-targets.js';
import { loadShadowWalkSettings } from '../shadow-walk/settings.js';
import { dataPath } from '../data-paths.js';
import type { ChassisHost } from './host.js';

/** The built interaction surfaces. */
export interface InteractionStack {
  hil: HilSurface;
  primitives: Primitives;
  actionLedger: ActionLedger;
}

/** When to use: the chassis constructor — build HIL, the ledger and primitives once. */
export function createInteractionStack(host: ChassisHost): InteractionStack {
  const hil = new HilSurface({
    activeWebContents: () => {
      try {
        return activeWebContents(host);
      } catch {
        return null;
      }
    },
    broadcast: (channel, payload) => {
      try {
        host.bus.broadcast(channel, payload);
      } catch {
        // Broadcasts must never break the hand-off flow itself.
      }
    },
    onStateChanged: (pending, request) => {
      host.trayManager?.updateStatus(host.state.agentStatus, host.state.tabs?.length || 0, pending);
      if (pending && request) {
        host.state.agentStatus = 'AWAITING_INPUT';
        host.state.activeAction = `⚠️ HUMAN ACTION REQUIRED: ${request.reason}`;
      } else {
        host.state.agentStatus = 'IDLE';
        host.state.activeAction = 'Standby - Awaiting MCP Uplink';
      }
      host.telemetry.broadcastState();
    },
    log: host.log,
    emitNavigation: (details) => host.telemetry.emitSimpleEvent('navigation', details),
  });

  // Local, append-only record of executed actions (data/transitions.jsonl). This is the dataset a
  // runner-side decision model learns from; it never leaves the machine and never stores typed text.
  const actionLedger = new ActionLedger({
    dir: dataPath(),
    log: host.log,
  });

  const primitives = new Primitives({
    webContents: () => activeWebContents(host),
    log: host.log,
    evaluate: (script) => host.page.quiet(script),
    harvest: (opts) => host.harvest.harvestMarkdown(opts),
    guardPageRead: (input) => host.jev.guardPageRead(input),
    precheckPageRead: (input) => host.jev.precheckPageRead(input),
    injectMarks: (opts) => host.marks.scan(activeWebContents(host), opts || {}),
    removeMarks: () => host.marksOverlay.removeMarks(activeWebContents(host)),
    getMarks: () => host.marks.getActive(),
    getMarkTarget: (id) =>
      Number(id) >= 100
        ? resolveFrameMark(activeWebContents(host), Number(id))
        : host.marksOverlay.getMarkTarget(activeWebContents(host), id),
    getFrames: (opts) => host.shadow.getFrames(opts),
    evaluateInFrames: (script, opts) => host.page.evaluateInFrames(script, opts),
    resolveSealedToken: (token) => resolveSealedToken(activeWebContents(host), token),
    clickMark: (id) => host.marks.clickMark(id),
    typeMark: (id, text, opts) => host.marks.typeMark(id, text, opts),
    clickElement: (selector, coords) => host.input.clickElement(selector, coords),
    typeText: (text, selector, opts) => host.input.typeText(text, selector, opts),
    findSealed: (opts) => host.marks.findSealed(opts),
    componentSurfaceEnabled: () => loadShadowWalkSettings().shadow.componentSurface,
    insertText: (text) => host.input.insertText(text),
    pasteText: (text) => host.input.simulator.keyboard.pasteText(activeWebContents(host), text),
    moveMouseTo: (target) => host.input.moveMouse(target),
    pressKey: (key) => host.input.pressKey(key),
    snapshotRenderedPage: (opts) => host.marks.snapshotRenderedPage(opts),
    getNetworkTraffic: (filter) => host.network.traffic(filter),
    getPageInfo: () => pageInfo(host),
    revision: () => currentRevision(host),
    windowFocused: () => host.window.isFocused(),
    recordTransition: (record) => actionLedger.record(record),
  });

  return { hil, primitives, actionLedger };
}
