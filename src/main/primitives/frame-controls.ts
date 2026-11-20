/**
 * Frame control filtering shared by observe's frame marks and find's frame search.
 *
 * A depth-0 frame is the page itself (already covered by the main scan), and only controls with
 * a numeric id >= 100 can be addressed by act (the main-page marks own the low ids).
 */

/** When to use: iterating a frame's addressable controls (depth > 0, numeric id >= 100). */
export function frameControls(frame: any): any[] {
  if (!frame || frame.depth === 0 || !Array.isArray(frame.controls)) return [];
  return frame.controls.filter((control: any) => typeof control.id === 'number' && control.id >= 100);
}
