/**
 * The research/crawl subsystem's mutable state.
 *
 * The surface class and the chassis both read these, so they live in one object rather than as
 * `BrowserChassis` fields (see issue #10: move state before behaviour).
 */
import type { WebContentsView } from 'electron';

/** When to use: reading or updating the detached utility view and the human-handoff state. */
export const researchState: {
  utilView: WebContentsView | null;
  hilActive: boolean;
  handoffSkipReason: string | null;
  utilQueue: Promise<void>;
} = {
  utilView: null,
  hilActive: false,
  handoffSkipReason: null,
  utilQueue: Promise.resolve(),
};
