/**
 * Measuring sealed controls: filter the identities, then ask CDP for each box.
 *
 * Same-process frames already report top-level viewport pixels; an OOPIF reports relative to
 * its own target's root, so that root's rect is added. Nested OOPIFs compose the same way.
 * Off-screen controls still get a token so the caller can scroll and re-measure them.
 *
 * When to use: `findSealedControls` after the identity scan (cached or fresh).
 */
import type { WebContents } from 'electron';
import type { FrameInfo } from '../browser/frames.js';
import { issueSealedToken } from './sealed-targets.js';
import { createSealedSessions } from './sealed-sessions.js';
import { lower, rectFromQuad, viewportOf } from './sealed-util.js';
import type { SealedControl, SealedFindOptions, SealedIdentity, SealedRect } from './sealed-types.js';

const MAX_LIMIT = 40;

/** When to use: `findSealedControls` — turns identities into measured, tokenised controls. */
export async function measureSealedControls(input: {
  wc: WebContents;
  frames: FrameInfo[];
  identities: SealedIdentity[];
  options: SealedFindOptions;
  notes: string[];
}): Promise<{ controls: SealedControl[]; total: number }> {
  const { wc, frames, identities, options, notes } = input;

  const limit = Math.max(1, Math.min(options.limit ?? 25, MAX_LIMIT));
  const want = lower(options.name || options.contains || '');
  const re = options.regex ? new RegExp(options.regex, options.flags || 'i') : null;
  const filtered = identities.filter((id) => {
    if (options.role && id.role !== lower(options.role)) return false;
    if (options.tag && id.nodeName !== String(options.tag).toUpperCase()) return false;
    if (want && !lower(id.name).includes(want)) return false;
    if (re && !re.test(id.name)) return false;
    return true;
  });

  const targetRootOffsets = new Map<string, { x: number; y: number }>();
  for (const frame of frames) {
    // `listFrames` is depth-ordered, so the first frame per target is that target's root.
    if (frame.oopif && frame.targetId && !targetRootOffsets.has(frame.targetId)) {
      targetRootOffsets.set(frame.targetId, { x: frame.rect.x, y: frame.rect.y });
    }
  }

  const cdp = createSealedSessions(wc);
  const { send } = cdp;
  let sessions = new Map<string, string>();
  let openedNow: string[] = [];
  try {
    const attached = await cdp.attach(frames);
    sessions = attached.sessions;
    openedNow = attached.opened;

    const out: SealedControl[] = [];
    const viewport = viewportOf(await send(undefined, 'Page.getLayoutMetrics').catch(() => null));
    for (const id of filtered) {
      if (out.length >= limit) break;
      const frame = frames[id.frameIndex];
      if (!frame) continue;
      const session = frame.oopif && frame.targetId ? sessions.get(frame.targetId) : undefined;
      let model: any;
      try {
        const raw = await send(session, 'DOM.getBoxModel', { backendNodeId: id.backendNodeId });
        model = raw?.model || raw;
      } catch {
        continue;
      }
      const base = rectFromQuad(model?.content);
      if (!base) continue;
      const offset = frame.oopif && frame.targetId ? targetRootOffsets.get(frame.targetId) : undefined;
      const rect: SealedRect = {
        x: base.x + (offset?.x || 0),
        y: base.y + (offset?.y || 0),
        width: base.width,
        height: base.height,
      };
      if (rect.width <= 0 || rect.height <= 0) continue;
      const inViewport =
        rect.x < viewport.width &&
        rect.y < viewport.height &&
        rect.x + rect.width > 0 &&
        rect.y + rect.height > 0;
      if (options.includeOffscreen === false && !inViewport) continue;
      out.push({
        role: id.role,
        name: id.name,
        rect,
        actions: id.actions,
        source: 'ax',
        frameId: frame.frameId,
        frameUrl: frame.url,
        inViewport,
        disabled: id.disabled || undefined,
        focusable: id.focusable || undefined,
        focused: id.focused || undefined,
        component: id.component,
        style: id.style,
        token: issueSealedToken(wc, id.backendNodeId, frame.frameId) || undefined,
      });
    }

    if (out.length < filtered.length) {
      notes.push(`${filtered.length - out.length} sealed match(es) not returned (limit or not measurable).`);
    }

    return { controls: out, total: filtered.length };
  } finally {
    await cdp.detach(openedNow);
  }
}
