/**
 * The HIL request shapes.
 *
 * Why a module: the manager, the store, the page banner and the IPC surface all
 * describe the same request and resolution. Keeping them beside the manager
 * would make the Electron-free store import Electron.
 */

/** When to use: a hand-off waiting on (or previously answered by) a human. */
export interface HilRequest {
  id: string;
  reason: string;
  url?: string;
  requestedAt: number;
  timeoutSeconds: number;
  status: 'pending' | 'resolved' | 'timeout' | 'cancelled';
  resolvedAt?: number;
  notes?: string;
}

/** When to use: what `requestIntervention` resolves with. */
export interface HilResolution {
  status: 'resolved' | 'timeout' | 'cancelled';
  elapsedSeconds: number;
  notes?: string;
}

/** When to use: a desktop notification raised by the media surface or the HUD. */
export interface NotificationOptions {
  title: string;
  message: string;
  urgency?: 'normal' | 'critical' | 'low';
  sound?: boolean;
}
