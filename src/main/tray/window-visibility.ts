/**
 * The shell window's visibility: show, hide and the "toggle" rule the tray icon uses.
 *
 * Why a module: three surfaces (the tray click, the context menu and the window routes) only
 * ever ask "show it", "hide it" or "flip it", and each flip has to refresh the tray menu. Owning
 * the window plus that one callback keeps the rule in one place.
 */
import type { BrowserWindow } from 'electron';

/** When to use: `new TrayManager` — the window, the menu refresh and the app's own hooks. */
export interface WindowVisibilityDeps {
  window: BrowserWindow;
  /** Re-paint the tray menu after the window changed state. */
  onChange: () => void;
  onShow?: () => void;
  onHide?: () => void;
}

/** When to use: `TrayManager.window` — one per tray. */
export class WindowVisibility {
  private readonly deps: WindowVisibilityDeps;

  constructor(deps: WindowVisibilityDeps) {
    this.deps = deps;
  }

  /** True when the window is on screen and not minimized (minimized is "hidden to tray"). */
  isVisible(): boolean {
    return this.deps.window.isVisible() && !this.deps.window.isMinimized();
  }

  /** Restore, show and focus, then refresh the menu and tell the app. */
  show(): void {
    if (this.deps.window.isMinimized()) this.deps.window.restore();
    this.deps.window.show();
    this.deps.window.focus();
    this.deps.onChange();
    this.deps.onShow?.();
  }

  /** Hide, then refresh the menu and tell the app. */
  hide(): void {
    this.deps.window.hide();
    this.deps.onChange();
    this.deps.onHide?.();
  }

  /**
   * A focused, visible window hides; anything else (unfocused, minimized, hidden) shows. The tray
   * icon and the menu item both use this, so a click always does what it looks like it will.
   */
  toggle(): void {
    if (this.isVisible() && this.deps.window.isFocused()) this.hide();
    else this.show();
  }
}
