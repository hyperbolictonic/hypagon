/**
 * CDP session plumbing for sealed discovery.
 *
 * Two phases need the same three things: a `sendCommand` that can address a child session, one
 * attach per OOPIF target (reused for every frame it hosts), and a detach in `finally`. Keeping
 * them here means the scan and the measurement pass cannot drift apart on session handling.
 *
 * When to use: `scanSealedIdentities` and `measureSealedControls`, both with an attached debugger.
 */
import type { WebContents } from 'electron';
import type { FrameInfo } from '../browser/frames.js';

/** When to use: addressing a command to the page or to one attached child target. */
export type SealedSend = (
  sessionId: string | undefined,
  method: string,
  params?: Record<string, unknown>,
) => Promise<any>;

/** When to use: the shared session handle both sealed phases work through. */
export interface SealedSessions {
  readonly send: SealedSend;
  /** Attach each OOPIF target once; returns target→session and the sessions to detach. */
  attach(
    frames: FrameInfo[],
    options?: { maxTargets?: number; onAttach?: () => void },
  ): Promise<{ sessions: Map<string, string>; opened: string[] }>;
  /** Detach every session this phase opened (safe to call with an empty list). */
  detach(opened: string[]): Promise<void>;
}

/** When to use: at the start of a sealed phase, after checking `wc.debugger.isAttached()`. */
export function createSealedSessions(wc: WebContents): SealedSessions {
  const dbg = wc.debugger;
  const send: SealedSend = async (sessionId, method, params = {}) => {
    return sessionId
      ? ((await dbg.sendCommand(method as any, params as any, sessionId)) as any)
      : ((await dbg.sendCommand(method as any, params as any)) as any);
  };

  return {
    send,
    async attach(frames, options = {}) {
      const sessions = new Map<string, string>();
      const opened: string[] = [];
      const maxTargets = options.maxTargets ?? Number.POSITIVE_INFINITY;
      for (const frame of frames) {
        if (!frame.oopif || !frame.targetId || sessions.has(frame.targetId)) continue;
        if (sessions.size >= maxTargets) break;
        options.onAttach?.();
        const attached = await send(undefined, 'Target.attachToTarget', { targetId: frame.targetId, flatten: true });
        if (!attached?.sessionId) continue;
        sessions.set(frame.targetId, attached.sessionId);
        opened.push(attached.sessionId);
        await send(attached.sessionId, 'Page.enable').catch(() => undefined);
        await send(attached.sessionId, 'DOM.enable').catch(() => undefined);
      }
      return { sessions, opened };
    },
    async detach(opened) {
      for (const sessionId of opened) {
        await dbg.sendCommand('Target.detachFromTarget', { sessionId } as any).catch(() => undefined);
      }
    },
  };
}
