/**
 * The measurement pass: turn cached AX identities into screen rects, and only
 * then into controls.
 *
 * Why a module: geometry is the second cost centre of sealed discovery and the
 * only part that touches `DOM.getBoxModel`. A hit that re-measures nothing (the
 * cache path) still goes through the same code, so the rect maths cannot diverge
 * between a fresh scan and a cached one.
 *
 * OOPIF geometry: a cross-process frame measures against its own root viewport,
 * so the root frame's top-level rect is added. Nested OOPIFs compose the same way.
 */
import type { BrowserTarget, FrameInfo } from '@hyperbolictonic/hypagon-browser';
import { layoutViewport } from '../../../browser/src/frames/layout-viewport.ts';
import { cdpSend, contentRect, type ContentRect } from './cdp.ts';
import { attachOopifSessions, detachOopifSessions, sessionOf } from './sealed-cdp.ts';
import { issueSealedToken } from './sealed-targets.ts';
import type { SealedControl, SealedFindOptions, SealedIdentity, SealedRect } from './sealed-types.ts';

const MAX_LIMIT = 40;

/** The first frame per target is that target's root (`listFrames` is depth-ordered). */
function targetRootOffsets(frames: FrameInfo[]): Map<string, { x: number; y: number }> {
  const offsets = new Map<string, { x: number; y: number }>();
  for (const frame of frames) {
    if (frame.oopif && frame.targetId && !offsets.has(frame.targetId)) {
      offsets.set(frame.targetId, { x: frame.rect.x, y: frame.rect.y });
    }
  }
  return offsets;
}

/** Top-level rect for a box model, or null when the box has no area. */
function rectOf(model: ContentRect | null, offset?: { x: number; y: number }): SealedRect | null {
  if (!model) return null;
  const rect = {
    x: model.x + (offset?.x || 0),
    y: model.y + (offset?.y || 0),
    width: model.width,
    height: model.height,
  };
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function isInViewport(rect: SealedRect, viewport: { width: number; height: number }): boolean {
  return (
    rect.x < viewport.width && rect.y < viewport.height && rect.x + rect.width > 0 && rect.y + rect.height > 0
  );
}

/**
 * When to use: after the identity filter — measures the matching controls, in
 * order, up to the limit, and returns them with their short-lived tokens.
 */
export async function measureSealedControls(
  target: BrowserTarget,
  frames: FrameInfo[],
  identities: SealedIdentity[],
  options: SealedFindOptions,
): Promise<{ controls: SealedControl[]; notes: string[] }> {
  const notes: string[] = [];
  const limit = Math.max(1, Math.min(options.limit ?? 25, MAX_LIMIT));
  const offsets = targetRootOffsets(frames);

  const send = cdpSend(target);
  const { sessions, opened } = await attachOopifSessions(send, frames);
  try {
    const viewport = layoutViewport(await send(undefined, 'Page.getLayoutMetrics').catch(() => null));
    const controls: SealedControl[] = [];

    for (const identity of identities) {
      if (controls.length >= limit) break;
      const frame = frames[identity.frameIndex];
      if (!frame) continue;

      const session = sessionOf(sessions, frame);
      let model: ContentRect | null = null;
      try {
        model = contentRect(await send(session, 'DOM.getBoxModel', { backendNodeId: identity.backendNodeId }));
      } catch {
        continue;
      }

      const offset = frame.oopif && frame.targetId ? offsets.get(frame.targetId) : undefined;
      const rect = rectOf(model, offset);
      if (!rect) continue;
      const inViewport = isInViewport(rect, viewport);
      if (options.includeOffscreen === false && !inViewport) continue;

      controls.push({
        role: identity.role,
        name: identity.name,
        rect,
        actions: identity.actions,
        source: 'ax',
        frameId: frame.frameId,
        frameUrl: frame.url,
        inViewport,
        disabled: identity.disabled || undefined,
        focusable: identity.focusable || undefined,
        focused: identity.focused || undefined,
        component: identity.component,
        style: identity.style,
        token: issueSealedToken(target, identity.backendNodeId, frame.frameId) || undefined,
      });
    }

    if (controls.length < identities.length) {
      notes.push(`${identities.length - controls.length} sealed match(es) not returned (limit or not measurable).`);
    }
    return { controls, notes };
  } finally {
    await detachOopifSessions(send, opened);
  }
}
