/**
 * The sidebar's shared state: its layout mode, its collaboration flag and its two elements.
 *
 * The sidebar renderer and the toolbar handlers both read these, so they live here rather than in
 * the entry point; the mutable fields are one object so both sides see updates.
 */
export type SidebarMode = 'docked' | 'floating' | 'collapsed';

/** When to use: reading or changing the sidebar layout and collaboration state. */
export const sidebarState: { mode: SidebarMode; collabModeOn: boolean } = {
  mode: 'floating',
  collabModeOn: false,
};

/** When to use: the floating sidebar panel element. */
export const sidebarPanel = document.getElementById('sidebar-panel') as HTMLElement | null;

/** When to use: the collapsed-rail toggle element. */
export const sidebarRailToggle = document.getElementById('sidebar-rail-toggle') as HTMLButtonElement | null;
