/**
 * Frame discovery, including cross-site iframes.
 *
 * `Page.getFrameTree` only lists frames that live in the tab's own process. A cross-site iframe
 * runs out-of-process (OOPIF) and appears only as an `iframe` target — so a parent-tree walk
 * silently drops it, which is exactly the frame an embedded checkout or consent wall uses.
 *
 * This module is the one place that knows how to assemble the two views:
 *   - `Page.getFrameTree` on the tab's target, for same-site frames;
 *   - `Target.attachToTarget({flatten:true})` + `Page.getFrameTree` on each `iframe` target.
 *
 * The returned `send` routes a command to the session that can see the document, and `release`
 * detaches only the sessions this call opened. No page code runs, no target is paused.
 *
 * Bounded and opt-in: one attach per OOPIF, capped. Never call this on a hot path.
 */
import type { WebContents } from 'electron';
import { bump } from '../metrics.js';

export interface FrameHandle {
  frameId: string;
  parentFrameId?: string;
  /** 0 = main frame. */
  depth: number;
  url: string;
  name: string;
  loaderId?: string;
  /** True for a frame hosted by a separate target (cross-site). */
  oopif: boolean;
  /** The target that hosts an OOPIF, or undefined for an in-process frame. */
  targetId?: string;
  /** Session id that can see the document; undefined = the tab's main target. */
  sessionId?: string;
}

export interface FrameContext {
  frames: FrameHandle[];
  /** Send a CDP command in the session that can see `frameId`. */
  sendFor(frameId: string, method: string, params?: Record<string, unknown>): Promise<any>;
  /** Send a CDP command on an explicit session (undefined = main target). */
  send(sessionId: string | undefined, method: string, params?: Record<string, unknown>): Promise<any>;
  sessionFor(frameId: string): string | undefined;
  /** Detach the OOPIF sessions opened by this discovery. Safe to call twice. */
  release(): Promise<void>;
}

interface LocalFrame {
  id: string;
  parentId?: string;
  url: string;
  name: string;
  loaderId?: string;
}

interface Candidate {
  targetId: string;
  sessionId: string;
  tree: any;
  used: boolean;
}

/** The mutable state one discovery builds up before it is returned as a `FrameContext`. */
interface Discovery {
  byId: Map<string, FrameHandle>;
  candidates: Candidate[];
  order: { value: number };
  orderById: Map<string, number>;
}

type Send = (sessionId: string | undefined, method: string, params?: Record<string, unknown>) => Promise<any>;

const MAX_OOPIF_TARGETS = 16;

function flatten(tree: any, parentId: string | undefined = undefined, depth = 0, out: LocalFrame[] = []): LocalFrame[] {
  const frame = tree?.frame;
  if (frame?.id) {
    out.push({
      id: String(frame.id),
      parentId: frame.parentId ? String(frame.parentId) : parentId,
      url: String(frame.url || ''),
      name: String(frame.name || ''),
      loaderId: frame.loaderId ? String(frame.loaderId) : undefined,
    });
  }
  for (const child of tree?.childFrames || []) flatten(child, frame?.id || parentId, depth + 1, out);
  return out;
}

/** The context a caller gets when there is no frame tree to walk. */
function emptyContext(): FrameContext {
  return {
    frames: [],
    sendFor: async () => {
      throw new Error('frame discovery is unavailable');
    },
    send: async () => {
      throw new Error('frame discovery is unavailable');
    },
    sessionFor: () => undefined,
    release: async () => undefined,
  };
}

/** One CDP sender for every session; bumps the shared metric so a scan is visible in the counters. */
function createSender(dbg: Electron.Debugger): Send {
  return async (sessionId, method, params = {}) => {
    bump('cdp.frame');
    return sessionId
      ? (dbg.sendCommand(method as any, params as any, sessionId) as Promise<any>)
      : (dbg.sendCommand(method as any, params as any) as Promise<any>);
  };
}

/** Add the same-process frames, then rebuild depth from the parent links `flatten` returns. */
function addMainTargetFrames(tree: any, discovery: Discovery): void {
  for (const frame of flatten(tree)) {
    discovery.byId.set(frame.id, {
      frameId: frame.id,
      parentFrameId: frame.parentId,
      depth: 0,
      url: frame.url,
      name: frame.name,
      loaderId: frame.loaderId,
      oopif: false,
    });
  }

  for (const frame of discovery.byId.values()) {
    let depth = 0;
    let cursor: FrameHandle | undefined = frame;
    const seen = new Set<string>();
    while (cursor?.parentFrameId && !seen.has(cursor.frameId)) {
      seen.add(cursor.frameId);
      cursor = discovery.byId.get(cursor.parentFrameId);
      if (!cursor) break;
      depth++;
    }
    frame.depth = depth;
    discovery.orderById.set(frame.frameId, discovery.order.value++);
  }
}

/** Attach every `iframe` target (capped) and read its frame tree. A vanished target is normal. */
async function attachIframeTargets(send: Send, discovery: Discovery): Promise<void> {
  const targets = ((await send(undefined, 'Target.getTargets')) as any)?.targetInfos || [];
  const iframeTargets = targets.filter((target: any) => target?.type === 'iframe').slice(0, MAX_OOPIF_TARGETS);

  for (const target of iframeTargets) {
    try {
      const attached = (await send(undefined, 'Target.attachToTarget', {
        targetId: target.targetId,
        flatten: true,
      })) as any;
      const sessionId = attached?.sessionId;
      if (!sessionId) continue;
      const candidate: Candidate = { targetId: String(target.targetId), sessionId, tree: null, used: false };
      discovery.candidates.push(candidate);
      await send(sessionId, 'Page.enable').catch(() => undefined);
      await send(sessionId, 'DOM.enable').catch(() => undefined);
      candidate.tree = (await send(sessionId, 'Page.getFrameTree')) as any;
    } catch {
      // A target that vanished between getTargets and attach is normal during navigation.
    }
  }
}

/**
 * Flatten an OOPIF's frame tree, offset by its parent's depth. Every frame in the target is
 * marked `oopif` because evaluation must go through that target's session.
 */
function addOopifTree(
  tree: any,
  parent: FrameHandle,
  candidate: Candidate,
  byId: Map<string, FrameHandle>,
  order: { value: number },
  orderById: Map<string, number>
): boolean {
  const local = flatten(tree, parent.frameId);
  const rootId = local[0]?.id;
  for (let i = 0; i < local.length; i++) {
    const frame = local[i];
    if (byId.has(frame.id)) continue;
    // The root's parentId is the frame in the parent target; deeper frames are local.
    const parentId = i === 0 ? parent.frameId : frame.parentId;
    const parentHandle = parentId ? byId.get(parentId) : undefined;
    if (!parentHandle) continue;
    byId.set(frame.id, {
      frameId: frame.id,
      parentFrameId: parentId,
      depth: parentHandle.depth + 1,
      url: frame.url,
      name: frame.name,
      loaderId: frame.loaderId,
      oopif: true,
      targetId: candidate.targetId,
      sessionId: candidate.sessionId,
    });
    // Keep a stable order for the frame budget.
    orderById.set(frame.id, order.value++);
  }
  // A target whose root frame was already known (a duplicate view) is still "used" for cleanup.
  if (rootId) candidate.used = true;
  return local.length > 0;
}

/**
 * Resolve ancestry to a fixpoint: an OOPIF can only be placed once its parent frame is known,
 * which also covers an OOPIF nested inside another OOPIF.
 */
function placeOopifCandidates(discovery: Discovery): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of discovery.candidates) {
      if (candidate.used || !candidate.tree?.frameTree?.frame) continue;
      const rootParentId = candidate.tree.frameTree.frame.parentId
        ? String(candidate.tree.frameTree.frame.parentId)
        : undefined;
      const parent = rootParentId ? discovery.byId.get(rootParentId) : undefined;
      if (!parent) continue;
      if (addOopifTree(candidate.tree.frameTree, parent, candidate, discovery.byId, discovery.order, discovery.orderById)) {
        changed = true;
      } else {
        candidate.used = true; // nothing to place; never spin on an empty tree
      }
    }
  }
}

export async function discoverFrames(
  wc: WebContents,
  options: { maxFrames?: number } = {}
): Promise<FrameContext> {
  const maxFrames = Math.max(1, Math.min(options.maxFrames ?? 8, 32));
  const dbg = wc?.debugger;
  const empty = emptyContext();
  if (!wc || wc.isDestroyed() || !dbg?.isAttached()) return empty;

  const discovery: Discovery = {
    byId: new Map(),
    candidates: [],
    order: { value: 0 },
    orderById: new Map(),
  };
  let released = false;

  const send = createSender(dbg);

  const release = async () => {
    if (released) return;
    released = true;
    for (const candidate of discovery.candidates) {
      await dbg.sendCommand('Target.detachFromTarget', { sessionId: candidate.sessionId } as any).catch(() => undefined);
    }
  };

  try {
    await send(undefined, 'Page.enable');
    await send(undefined, 'DOM.enable');
    const mainTree = (await send(undefined, 'Page.getFrameTree')) as any;
    const mainRoot = mainTree?.frameTree?.frame;
    if (!mainRoot?.id) return { ...empty, release };

    addMainTargetFrames(mainTree.frameTree, discovery);
    await attachIframeTargets(send, discovery);
    placeOopifCandidates(discovery);

    const frames = [...discovery.byId.values()]
      .sort(
        (a, b) =>
          a.depth - b.depth || (discovery.orderById.get(a.frameId) ?? 0) - (discovery.orderById.get(b.frameId) ?? 0),
      )
      .slice(0, maxFrames);

    return {
      frames,
      send,
      sendFor: (frameId, method, params = {}) => send(discovery.byId.get(frameId)?.sessionId, method, params),
      sessionFor: (frameId) => discovery.byId.get(frameId)?.sessionId,
      release,
    };
  } catch {
    await release();
    return empty;
  }
}
