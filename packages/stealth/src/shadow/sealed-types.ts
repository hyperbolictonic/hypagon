/**
 * The shapes a sealed (closed shadow-root) discovery returns, and the identity
 * row it caches between scans.
 *
 * Why a module: the scanner, the measurer and the facade all pass the same two
 * structures around, and `primitives` / `marks-surface` import the public ones.
 * Keeping them beside the scanner would make the measurer import the class that
 * produced its input.
 */
import type {
  ComponentSurface,
  SealedControl,
  SealedFindOptions,
  SealedFindResult,
  SealedRect,
} from '@hyperbolictonic/hypagon-browser';

export type { SealedControl, SealedFindOptions, SealedFindResult, SealedRect };

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
