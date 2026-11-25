/**
 * Frame-scoped evaluation.
 *
 * `webContents.executeJavaScript` only sees the main frame. Consent walls (Sourcepoint), embedded
 * checkouts and some widget forms live in cross-origin child frames, so the main-frame DOM scan
 * cannot answer them — which is why a CMP can be "detected" and still be unclickable.
 *
 * This walks the merged frame tree (same-site frames plus detached cross-site `iframe` targets)
 * and evaluates the same expression in each frame's own isolated world. Deliberately opt-in and
 * bounded: every frame costs two CDP commands, so callers choose the frame budget and nobody runs
 * this on a hot path.
 *
 * Reuse (Phase 2+): marks, consent, extract. Keep it dependency-free.
 */
import type { WebContents } from 'electron';
import { discoverFrames, type FrameContext, type FrameHandle } from './frame-tree.js';

export interface FrameEvalOptions {
  /** Frames to visit, breadth-first including the main frame (default 8). */
  maxFrames?: number;
  /** Per-command timeout (default 1500ms). */
  timeoutMs?: number;
  /** Include about:blank / empty frames (default false). */
  includeBlank?: boolean;
  /** Per-frame expression override (used by the frame-mark scanner for a unique id block). */
  expressionForFrame?: (frame: { frameId: string; url?: string; name?: string; depth: number; oopif: boolean }, index: number) => string;
}

export interface FrameEvalResult {
  frameId: string;
  url?: string;
  name?: string;
  ok: boolean;
  /** 0 = main frame. */
  depth?: number;
  /** Frame was hosted by a separate target (cross-site). */
  oopif?: boolean;
  value?: unknown;
  error?: string;
}

interface FrameCacheEntry {
  loaderId: string;
  contextId: number;
}

/** Per-webContents cache: same-process isolated worlds survive until the document is replaced. */
const frameCache = new WeakMap<WebContents, Map<string, FrameCacheEntry>>();

function cacheFor(wc: WebContents): Map<string, FrameCacheEntry> {
  let cache = frameCache.get(wc);
  if (!cache) {
    cache = new Map();
    frameCache.set(wc, cache);
    // A new document invalidates every context id for this webContents.
    wc.on('did-start-loading', () => cache!.clear());
  }
  return cache;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** A frame with no document of its own: skipped unless the caller asked for blanks. */
function isBlankFrame(frame: FrameHandle): boolean {
  return !frame.url || frame.url === 'about:blank' || frame.url === 'about:srcdoc';
}

/** One result row: the frame facts plus the ok/error-or-value outcome. */
function frameResult(
  frame: { frameId: string; url: string; name: string; depth: number; oopif: boolean },
  outcome: { ok: boolean; error?: string; value?: unknown },
): FrameEvalResult {
  return {
    frameId: frame.frameId,
    url: frame.url,
    name: frame.name,
    depth: frame.depth,
    oopif: frame.oopif,
    ok: outcome.ok,
    ...(outcome.error !== undefined ? { error: outcome.error } : {}),
    ...(outcome.value !== undefined ? { value: outcome.value } : {}),
  };
}

/** The expression this frame runs: the shared one, or the caller's per-index override. */
function expressionFor(
  frame: FrameHandle,
  index: number,
  expression: string,
  options: FrameEvalOptions,
): string {
  if (!options.expressionForFrame) return expression;
  return options.expressionForFrame(
    { frameId: frame.frameId, url: frame.url, name: frame.name, depth: frame.depth, oopif: frame.oopif },
    index,
  );
}

/**
 * The isolated world for this frame, created on first use and reused until the document changes.
 * OOPIF sessions are detached after every call, so their context ids never outlive the scan.
 */
async function executionContextFor(
  ctx: FrameContext,
  frame: FrameHandle,
  cache: Map<string, FrameCacheEntry>,
  sessionId: string | undefined,
  timeoutMs: number,
): Promise<number> {
  let entry = sessionId ? undefined : cache.get(frame.frameId);
  // A new loaderId means the document (and therefore the isolated world) is gone.
  if (!entry || (frame.loaderId && entry.loaderId && entry.loaderId !== frame.loaderId)) {
    const world = (await withTimeout(
      ctx.send(sessionId, 'Page.createIsolatedWorld', {
        frameId: frame.frameId,
        worldName: 'kuang-probe',
        grantUniveralAccess: false,
      }),
      timeoutMs,
      'Page.createIsolatedWorld'
    )) as any;
    entry = { loaderId: frame.loaderId || '', contextId: Number(world?.executionContextId) || 0 };
    if (entry.contextId && !sessionId) cache.set(frame.frameId, entry);
  }
  if (!entry?.contextId) throw new Error('no execution context');
  return entry.contextId;
}

/** Evaluate one frame; a stale context is dropped so the next call re-creates it. */
async function evaluateFrame(
  ctx: FrameContext,
  frame: FrameHandle,
  frameExpression: string,
  cache: Map<string, FrameCacheEntry>,
  timeoutMs: number,
): Promise<FrameEvalResult> {
  const sessionId = ctx.sessionFor(frame.frameId);
  try {
    const contextId = await executionContextFor(ctx, frame, cache, sessionId, timeoutMs);
    const evaluated = (await withTimeout(
      ctx.send(sessionId, 'Runtime.evaluate', {
        expression: frameExpression,
        contextId,
        returnByValue: true,
        awaitPromise: true,
        userGesture: false,
      }),
      timeoutMs,
      'Runtime.evaluate'
    )) as any;

    if (evaluated?.exceptionDetails) {
      const detail = evaluated.exceptionDetails;
      return frameResult(frame, {
        ok: false,
        error: detail?.exception?.description || detail?.text || 'frame exception',
      });
    }
    return frameResult(frame, { ok: true, value: evaluated?.result?.value });
  } catch (err: any) {
    // A stale context is normal after a frame swaps document; drop it so the next call re-creates.
    cache.delete(frame.frameId);
    return frameResult(frame, { ok: false, error: String(err?.message || err) });
  }
}

/**
 * Evaluate `expression` in the main frame and up to `maxFrames` child frames.
 * Never throws: a frame that fails (detached, sandboxed, timed out) is reported with `ok:false`.
 */
export async function evaluateInFrames(
  wc: WebContents,
  expression: string,
  options: FrameEvalOptions = {}
): Promise<FrameEvalResult[]> {
  if (!wc || wc.isDestroyed()) return [];
  const maxFrames = Math.max(1, Math.min(options.maxFrames ?? 8, 16));
  const timeoutMs = Math.max(250, Math.min(options.timeoutMs ?? 1500, 10000));
  const includeBlank = options.includeBlank === true;

  const dbg = wc.debugger;
  // The app attaches the debugger for trusted CDP input; without it there is nothing to walk.
  if (!dbg?.isAttached()) return [];

  const ctx = await discoverFrames(wc, { maxFrames });
  if (!ctx.frames.length) {
    await ctx.release();
    return [];
  }

  const cache = cacheFor(wc);
  const results: FrameEvalResult[] = [];

  try {
    for (const [index, frame] of ctx.frames.entries()) {
      if (isBlankFrame(frame) && !includeBlank) {
        results.push(frameResult(frame, { ok: false, error: 'blank frame skipped' }));
        continue;
      }
      const frameExpression = expressionFor(frame, index, expression, options);
      results.push(await evaluateFrame(ctx, frame, frameExpression, cache, timeoutMs));
    }
    return results;
  } finally {
    await ctx.release();
  }
}
