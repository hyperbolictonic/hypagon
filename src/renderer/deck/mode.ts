/**
 * How this renderer was asked to boot.
 *
 * Why a module: the HUD, the sidebar overlay and the menu popup are the same bundle with a
 * different query string, and three modules need to know which one they are in.
 */

/** `?menupopup=1` — the popup-menu renderer (no HUD work). */
export const MENU_POPUP_MODE = new URLSearchParams(window.location.search).has('menupopup');

/** `?sidebar=1` — the native Command Deck overlay (no trail, no heartbeat). */
export const SIDEBAR_MODE = new URLSearchParams(window.location.search).has('sidebar');
