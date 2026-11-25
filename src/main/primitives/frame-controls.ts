/**
 * The child-frame controls a mark list can address.
 *
 * Why a module: a frame scan returns the main frame plus every child frame, and
 * both the observe path and the find path need the same filter — skip the main
 * frame, and keep only controls the are registered for live resolution (the
 * main frame owns 1..99, child controls start at 100). Two copies of that walk
 * were the last duplication left in `primitives.ts`.
 */

/** One addressable control plus the frame it lives in. */
export interface AddressedFrameControl {
  /** The child frame, for the `frameId` / `url` a mark row carries. */
  frame: any;
  /** The control, already known to have a resolvable id. */
  control: any;
}

/**
 * When to use: turning a `getFrames({ includeControls: true })` result into
 * mark rows or search hits — yields only addressable child-frame controls.
 */
export function* addressedFrameControls(data: { frames?: any[] }): Generator<AddressedFrameControl> {
  for (const frame of data.frames || []) {
    if (frame.depth === 0 || !Array.isArray(frame.controls)) continue;
    for (const control of frame.controls) {
      if (typeof control.id !== 'number' || control.id < 100) continue;
      yield { frame, control };
    }
  }
}
