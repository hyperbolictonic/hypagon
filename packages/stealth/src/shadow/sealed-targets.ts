/**
 * Short-lived sealed targets.
 *
 * A sealed result carries coordinates because it has no DOM handle. That is enough while the
 * control is on screen, but clicking an off-screen coordinate is a guess. This module gives each
 * returned sealed control an opaque token that resolves back to its `backendNodeId`; `act` can then
 * ask the browser to scroll the actual node into view and measure it live before the click.
 *
 * Tokens are per tab, expire after two minutes, and are invalidated by a fresh sealed scan or a
 * navigation (the backend node is gone). They are capabilities for one scan, not durable ids.
 */
import crypto from 'node:crypto';
import type { BrowserTarget } from '@hyperbolictonic/hypagon-browser';
import { listFrames } from '../../../browser/src/frames/frames.ts';
import { discoverFrames } from '../../../browser/src/frames/frame-tree.ts';
import { contentRect } from './cdp.ts';
import { sealedMetric } from './metrics.ts';

interface SealedTarget {
  backendNodeId: number;
  frameId: string;
  expiresAt: number;
}

const targets = new WeakMap<BrowserTarget, Map<string, SealedTarget>>();
const TTL_MS = 120000;

/** When to use: a fresh sealed scan or a navigation — invalidate the target's sealed tokens. */
export function clearSealedTokens(target: BrowserTarget): void {
  targets.delete(target);
}

/** When to use: a sealed result — mint an opaque token that can scroll and measure the node later. */
export function issueSealedToken(target: BrowserTarget, backendNodeId: number, frameId: string): string {
  if (!target || !backendNodeId || !frameId) return '';
  let map = targets.get(target);
  if (!map) {
    map = new Map();
    targets.set(target, map);
  }
  const token = `st_${crypto.randomBytes(9).toString('base64url')}`;
  map.set(token, { backendNodeId: Number(backendNodeId), frameId, expiresAt: Date.now() + TTL_MS });
  // Bound the registry: a page can have many sealed controls, but only the current scan matters.
  if (map.size > 400) {
    const now = Date.now();
    for (const [key, value] of map) if (value.expiresAt < now || map.size > 300) map.delete(key);
  }
  sealedMetric('tokens');
  return token;
}

/**
 * Resolve a sealed token to a live top-level viewport centre, scrolling the real node into view.
 * Returns null when the token expired, the frame navigated, or the node disappeared.
 */
export async function resolveSealedToken(
  target: BrowserTarget,
  token: string,
): Promise<{ center: { x: number; y: number }; rect: { x: number; y: number; width: number; height: number }; frameId: string } | null> {
  const entry = targets.get(target)?.get(String(token || ''));
  if (!entry || entry.expiresAt < Date.now()) return null;

  const frames = await listFrames(target, { maxFrames: 16 });
  const frame = frames.find((f) => f.frameId === entry.frameId);
  if (!frame) return null;

  const ctx = await discoverFrames(target, { maxFrames: 16 });
  try {
    const session = ctx.sessionFor(entry.frameId);
    await ctx.send(session, 'DOM.scrollIntoViewIfNeeded', { backendNodeId: entry.backendNodeId });
    // Give the compositor one frame to settle after a scroll.
    await new Promise((resolve) => setTimeout(resolve, 90));

    const raw = await ctx.send(session, 'DOM.getBoxModel', { backendNodeId: entry.backendNodeId });
    const model = contentRect(raw);
    if (!model || model.width <= 0 || model.height <= 0) return null;

    // Same-process box models are already top-level viewport coordinates. An OOPIF session is
    // relative to that target's root frame, so add the root's page-space origin.
    let offset = { x: 0, y: 0 };
    if (frame.oopif && frame.targetId) {
      const root = frames
        .filter((f) => f.oopif && f.targetId === frame.targetId)
        .sort((a, b) => a.depth - b.depth)[0];
      if (root) offset = { x: root.rect.x, y: root.rect.y };
    }

    const rect = {
      x: Math.round(model.x + offset.x),
      y: Math.round(model.y + offset.y),
      width: Math.round(model.width),
      height: Math.round(model.height),
    };
    return {
      center: { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) },
      rect,
      frameId: frame.frameId,
    };
  } catch {
    return null;
  } finally {
    await ctx.release();
  }
}
