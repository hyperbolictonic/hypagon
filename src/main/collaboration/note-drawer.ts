/**
 * The anchored note composer injected into the page.
 *
 * The drawer is mounted next to the picked element, follows it while the page scrolls, can be
 * minimised to a compact pill and can be dragged out of the way. Exposed on `window` so the
 * picker and the tests share one implementation. `rightInset` is the width covered by the
 * floating deck panel; placement avoids it.
 */
import { DRAWER_COMPOSE } from './drawer-script-compose.js';
import { DRAWER_EVENTS } from './drawer-script-events.js';
import { DRAWER_SHELL } from './drawer-script-shell.js';

/** When to use: injecting the human note composer into a page. */
export function collaborationNoteDrawerScript(): string {
  return `${DRAWER_SHELL}${DRAWER_COMPOSE}${DRAWER_EVENTS}`;
}
