/**
 * The sealed-discovery surface: what a scan returns, what it accepts, and the one refusal.
 *
 * Kept apart from the scan so the primitives layer can type a sealed control without
 * importing CDP code, and so the rate-limit error can be caught by code on either side.
 */
import type { ComponentSurface } from './component-signature.js';

/** When to use: placing a sealed control in page coordinates (x, y, width, height). */
export interface SealedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: reading a control discovered inside a closed shadow root (role, name, box). */
export interface SealedControl {
  role: string;
  name: string;
  rect: SealedRect;
  actions: string[];
  source: 'ax';
  frameId: string;
  frameUrl?: string;
  inViewport: boolean;
  disabled?: boolean;
  focusable?: boolean;
  focused?: boolean;
  /** Host exported surface, when the control belongs to a custom-element host. */
  component?: ComponentSurface;
  /** Stylesheet provenance when cdpStyleMatch is on. */
  style?: { sourceUrl?: string; constructed?: boolean };
  /** Short-lived capability for scrolling/re-measuring an offscreen control. */
  token?: string;
}

/** When to use: bounding a sealed scan (max controls, timeout, hit test). */
export interface SealedFindOptions {
  role?: string;
  name?: string;
  contains?: string;
  regex?: string;
  flags?: string;
  tag?: string;
  selector?: string;
  limit?: number;
  includeOffscreen?: boolean;
  /** Bypass the identity cache (use after a DOM change that did not bump the revision). */
  refresh?: boolean;
  /** Chassis revision, so a click invalidates the cached identity list. */
  revision?: number;
}

/** When to use: returning sealed controls plus scan notes to the primitives layer. */
export interface SealedFindResult {
  controls: SealedControl[];
  /** Matches before the limit / offscreen filter. */
  total: number;
  cached: boolean;
  frames: number;
  scannedAt: number;
  notes: string[];
}

/** When to use: catching the sealed-scan rate limit and returning retry_after, not a generic error. */
export class SealedRateLimitError extends Error {
  public code = 'SEALED_RATE_LIMITED';
  public retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(`Sealed discovery is rate-limited (6 scans/minute per tab); retry in ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = 'SealedRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** When to use: one discovered control before its geometry is measured. */
export interface SealedIdentity {
  backendNodeId: number;
  frameIndex: number;
  role: string;
  name: string;
  nodeName: string;
  actions: string[];
  disabled: boolean;
  focusable: boolean;
  focused: boolean;
  order: number;
  component?: ComponentSurface;
  style?: { sourceUrl?: string; constructed?: boolean };
}
