/**
 * Shared styling for the collaboration surfaces.
 *
 * Everything is namespaced under the injected root ids so page styles cannot leak in and the
 * overlay cannot be restyled by the host page. The fragments are grouped by surface; the
 * concatenation order matches the original stylesheet.
 */
import { CSS_POP_CSS } from './overlay-css-csspop.js';
import { DRAWER_CSS } from './overlay-css-drawer.js';
import { ELEMENT_BAR_CSS } from './overlay-css-elementbar.js';
import { LAYER_CSS } from './overlay-css-layer.js';
import { SELECTION_CSS } from './overlay-css-selection.js';

/** When to use: injecting the collaboration stylesheet into a page. */
export const COLLAB_CSS = `
${DRAWER_CSS}${SELECTION_CSS}${LAYER_CSS}${ELEMENT_BAR_CSS}${CSS_POP_CSS}`;
