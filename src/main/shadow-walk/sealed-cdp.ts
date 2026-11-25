/**
 * The CDP plumbing two sealed phases share: the OOPIF sessions and the frame
 * lookup that goes with them.
 *
 * Why a module: the identity scan and the measurement pass each attach the same
 * flattened target sessions and detach them again. That six-line loop was
 * duplicated in both; one helper keeps the max-targets cap and the detach in a
 * single place.
 */
import type { FrameInfo } from '../browser/frames.js';

/** One session send: `sessionId` undefined targets the root frame. */
export type SealedSend = (
  sessionId: string | undefined,
  method: string,
  params?: Record<string, unknown>,
) => Promise<any>;

/** How many cross-process targets one sealed call may attach. */
export const MAX_TARGETS = 8;

/** When to use: resolving a frame's OOPIF session; undefined means the parent session. */
export function sessionOf(sessions: Map<string, string>, frame: FrameInfo | undefined): string | undefined {
  if (!frame?.oopif || !frame.targetId) return undefined;
  return sessions.get(frame.targetId);
}

/**
 * When to use: the start of a scan or a measurement — attach each OOPIF target
 * once (the same session serves every frame it hosts) and enable the two domains
 * the caller needs.
 */
export async function attachOopifSessions(
  send: SealedSend,
  frames: FrameInfo[],
): Promise<{ sessions: Map<string, string>; opened: string[] }> {
  const sessions = new Map<string, string>();
  const opened: string[] = [];
  for (const frame of frames) {
    if (!frame.oopif || !frame.targetId || sessions.has(frame.targetId)) continue;
    if (sessions.size >= MAX_TARGETS) break;
    const attached = await send(undefined, 'Target.attachToTarget', { targetId: frame.targetId, flatten: true });
    if (!attached?.sessionId) continue;
    sessions.set(frame.targetId, attached.sessionId);
    opened.push(attached.sessionId);
    await send(attached.sessionId, 'Page.enable').catch(() => undefined);
    await send(attached.sessionId, 'DOM.enable').catch(() => undefined);
  }
  return { sessions, opened };
}

/** When to use: the finally block of a scan or a measurement. */
export async function detachOopifSessions(
  dbg: { sendCommand(...args: any[]): Promise<any> },
  opened: string[],
): Promise<void> {
  for (const sessionId of opened) {
    await dbg.sendCommand('Target.detachFromTarget', { sessionId } as any).catch(() => undefined);
  }
}
