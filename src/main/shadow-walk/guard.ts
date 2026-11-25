/**
 * The Shadow Walk refusal shared by every surface that can be disabled.
 *
 * Marks deep-open scans, frame inventories and trusted Tab walks all ask the
 * same policy question; the structured error is the single answer.
 */
import { shadowWalkRefusal, type ShadowWalkSurface as ShadowWalkSurfaceName } from './settings.js';

/** When to use: before a surface that Settings → Shadow Walk can disable. */
export function assertShadowSurface(surface: ShadowWalkSurfaceName): void {
  const refusal = shadowWalkRefusal(surface);
  if (!refusal) return;
  const error: any = new Error(refusal.message);
  error.code = refusal.code;
  throw error;
}
