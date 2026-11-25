/**
 * The shapes a sealed (closed shadow-root) discovery returns, and the identity
 * row it caches between scans.
 *
 * Why a module: the scanner, the measurer and the facade all pass the same two
 * structures around, and `primitives` / `marks-surface` import the public ones.
 * Keeping them beside the scanner would make the measurer import the class that
 * produced its input.
 */
import type { ComponentSurface } from './component-signature.js';

/** When to use: any screen-space rect the sealed path reports. */
export interface SealedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: one interactive control found under a closed shadow root. */
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

/** When to use: the `find(sealed:true)` filters. */
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

/** When to use: the `find(sealed:true)` result. */
export interface SealedFindResult {
  controls: SealedControl[];
  /** Matches before the limit / offscreen filter. */
  total: number;
  cached: boolean;
  frames: number;
  scannedAt: number;
  notes: string[];
}

/**
 * One control as the AX tree describes it, before any geometry is measured.
 * The scan caches these; a repeat call re-measures only what it returns.
 */
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

/** When to use: the per-tab cache entry the scan writes and the next call reads. */
export interface SealedCacheEntry {
  key: string;
  at: number;
  identities: SealedIdentity[];
  notes: string[];
  frames: number;
}
