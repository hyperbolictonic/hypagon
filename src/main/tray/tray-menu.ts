/**
 * The tray icon's context menu: what the agent is doing, whether a human is needed, show/hide,
 * close-to-tray and quit.
 *
 * Why a module: the menu is a pure projection of the manager's state plus a handful of actions,
 * so it can be built (and asserted) without a Tray instance.
 */
import type { MenuItemConstructorOptions } from 'electron';

/** When to use: `TrayManager.updateMenu` — the state the menu labels read. */
export interface TrayMenuState {
  visible: boolean;
  closeToTray: boolean;
  hilPending: boolean;
  status: string;
  tabCount: number;
}

/** When to use: `TrayManager.updateMenu` — the actions the menu items invoke. */
export interface TrayMenuActions {
  show(): void;
  toggle(): void;
  setCloseToTray(enabled: boolean): void;
  quit(): void;
}

/** When to use: `Menu.buildFromTemplate` in the tray manager. */
export function trayMenuTemplate(
  state: TrayMenuState,
  actions: TrayMenuActions,
): MenuItemConstructorOptions[] {
  const hilLabel = state.hilPending ? '⚠️ ACTION REQUIRED (Human Intervention)' : 'Human Intervention: None';

  return [
    {
      label: 'Kuang Grade Mark Eleven',
      enabled: false,
    },
    {
      label: `Status: ${state.status} | Tabs: ${state.tabCount}`,
      enabled: false,
    },
    ...(state.hilPending
      ? [
          {
            label: hilLabel,
            click: () => {
              actions.show();
            },
          },
        ]
      : []),
    { type: 'separator' },
    {
      label: state.visible ? 'Hide to Tray' : 'Show Window',
      click: () => {
        actions.toggle();
      },
    },
    {
      label: 'Minimize to Tray on Close',
      type: 'checkbox',
      checked: state.closeToTray,
      click: (item: { checked: boolean }) => {
        actions.setCloseToTray(item.checked);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Cyberdeck',
      click: () => {
        actions.quit();
      },
    },
  ];
}
