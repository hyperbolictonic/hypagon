/**
 * Native right-click menu for browsing tabs.
 *
 * Why: a WebContentsView inside Electron has **no** default context menu. Without this,
 * copy / paste / select-all / inspect are unreachable for the human driving the browser —
 * and so is "copy link", "open in new tab" and "reload". The menu is built per right-click
 * from the event's `params`, so it only offers what is true for that pixel: paste is enabled
 * only in an editable field, link actions only over a link, image actions only over an image.
 *
 * The actions are issued against the **tab's own webContents** (`wc.copy()`, `wc.paste()`, …)
 * rather than as Electron menu roles, because roles target whichever window is focused — and
 * in this app the focused window is the Cyberdeck shell, not the browsing tab.
 *
 * Each section below is one question the menu answers ("can you edit here?", "is there a
 * link?", "where can you navigate?"). Sections are composed in `attachContextMenu`; a
 * section that does not apply returns an empty list, so its separator disappears with it.
 */
import { BrowserWindow, Menu, clipboard, shell, type MenuItemConstructorOptions, type WebContents } from 'electron';

/** When to use: attachContextMenu options — the window the menu pops over, plus the new-tab and log hooks. */
export interface ContextMenuOptions {
  window: BrowserWindow;
  /** Open a URL in a new browsing tab (the caller owns tab creation/activation). */
  onOpenLinkInNewTab?: (url: string) => void;
  onLog?: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** Everything one right-click knows: the tab, the click, and the callbacks. */
interface MenuContext {
  wc: WebContents;
  params: Electron.ContextMenuParams;
  options: ContextMenuOptions;
  can: Electron.EditFlags;
  copySelection: () => void;
  withFocus: (action: () => void) => void;
}

const truncate = (value: string, max: number) => (value.length > max ? value.slice(0, max - 1) + '…' : value);

/** Spellcheck suggestions, when Chromium has them. */
function spellingItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { wc, params } = ctx;
  if (!params.misspelledWord) return [];
  const items: MenuItemConstructorOptions[] = (params.dictionarySuggestions || [])
    .slice(0, 4)
    .map((suggestion) => ({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) }));
  items.push({ label: 'Add to dictionary', click: () => wc.session.addWordToSpellCheckerDictionary(params.misspelledWord) });
  items.push({ type: 'separator' });
  return items;
}

/** Undo / redo / cut / copy / paste — editable fields only. */
function editingItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { wc, params, can, copySelection, withFocus } = ctx;
  if (!params.isEditable) return [];
  return [
    { label: 'Undo', accelerator: 'CmdOrCtrl+Z', enabled: can.canUndo, click: () => withFocus(() => wc.undo()) },
    { label: 'Redo', accelerator: 'CmdOrCtrl+Y', enabled: can.canRedo, click: () => withFocus(() => wc.redo()) },
    { type: 'separator' },
    { label: 'Cut', accelerator: 'CmdOrCtrl+X', enabled: can.canCut, click: () => withFocus(() => wc.cut()) },
    { label: 'Copy', accelerator: 'CmdOrCtrl+C', enabled: can.canCopy, click: copySelection },
    { label: 'Paste', accelerator: 'CmdOrCtrl+V', enabled: can.canPaste, click: () => withFocus(() => wc.paste()) },
    { label: 'Paste as plain text', enabled: can.canPaste, click: () => withFocus(() => wc.pasteAndMatchStyle()) },
    { label: 'Select all', accelerator: 'CmdOrCtrl+A', click: () => withFocus(() => wc.selectAll()) },
    { type: 'separator' },
  ];
}

/** Selected text in a read-only page: copy, or search the web for it. */
function selectionItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { params, copySelection } = ctx;
  if (params.isEditable) return [];
  const selected = params.selectionText.trim();
  if (!selected) return [];
  return [
    { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: copySelection },
    {
      label: `Search the web for “${truncate(selected, 24)}”`,
      click: () => void shell.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(selected)}`),
    },
    { type: 'separator' },
  ];
}

/** Actions that only make sense over a link. */
function linkItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { params, options } = ctx;
  if (!params.linkURL) return [];
  return [
    {
      label: 'Open link in new tab',
      enabled: Boolean(options.onOpenLinkInNewTab),
      click: () => options.onOpenLinkInNewTab?.(params.linkURL),
    },
    { label: 'Open link in system browser', click: () => void shell.openExternal(params.linkURL) },
    { label: 'Copy link address', click: () => void clipboard.writeText(params.linkURL) },
    { type: 'separator' },
  ];
}

/** Actions that only make sense over an image. */
function imageItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { wc, params } = ctx;
  if (params.mediaType !== 'image' || !params.srcURL) return [];
  return [
    { label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) },
    { label: 'Copy image address', click: () => void clipboard.writeText(params.srcURL) },
    { label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) },
    { type: 'separator' },
  ];
}

/** Back / forward / reload, read from the tab's navigation history. */
function historyItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { wc } = ctx;
  const history = (wc as any).navigationHistory;
  const canGoBack = history ? history.canGoBack() : (wc as any).canGoBack?.() === true;
  const canGoForward = history ? history.canGoForward() : (wc as any).canGoForward?.() === true;
  return [
    { label: 'Back', enabled: canGoBack, click: () => (history ? history.goBack() : (wc as any).goBack?.()) },
    { label: 'Forward', enabled: canGoForward, click: () => (history ? history.goForward() : (wc as any).goForward?.()) },
    { label: 'Reload', click: () => wc.reload() },
    { type: 'separator' },
  ];
}

/** Page-level actions: copy the URL, inspect, DevTools. */
function pageItems(ctx: MenuContext): MenuItemConstructorOptions[] {
  const { wc, params } = ctx;
  return [
    { label: 'Copy page URL', click: () => void clipboard.writeText(wc.getURL()) },
    { label: 'Copy page address as Markdown link', click: () => void clipboard.writeText(`[${wc.getTitle()}](${wc.getURL()})`) },
    { type: 'separator' },
    {
      label: 'Inspect element',
      accelerator: 'CmdOrCtrl+Shift+C',
      click: () => {
        wc.inspectElement(params.x, params.y);
        if (!wc.isDevToolsOpened()) wc.openDevTools({ mode: 'detach' });
      },
    },
    { label: 'Open DevTools', accelerator: 'CmdOrCtrl+Shift+I', click: () => wc.toggleDevTools() },
  ];
}

/**
 * When to use: attach the right-click menu to a browsing tab's WebContents. Builds the
 * template from the click's `params`, so only actions true for that pixel appear.
 */
export function attachContextMenu(wc: WebContents, options: ContextMenuOptions): void {
  wc.on('context-menu', (_event, params) => {
    const ctx: MenuContext = {
      wc,
      params,
      options,
      can: params.editFlags || ({} as Electron.EditFlags),
      copySelection: () => {
        // Prefer the text Chromium reports for this click: `wc.copy()` acts on whatever has focus
        // in the webContents, and opening a native menu can move that focus to the shell.
        if (params.selectionText) void clipboard.writeText(params.selectionText);
        else wc.copy();
      },
      withFocus: (action) => {
        wc.focus();
        setTimeout(action, 0);
      },
    };

    const template: MenuItemConstructorOptions[] = [
      ...spellingItems(ctx),
      ...editingItems(ctx),
      ...selectionItems(ctx),
      ...linkItems(ctx),
      ...imageItems(ctx),
      ...historyItems(ctx),
      ...pageItems(ctx),
    ];

    const menu = Menu.buildFromTemplate(template);
    options.onLog?.('info', `Context menu at (${params.x}, ${params.y}) — ${template.filter((i) => i.type !== 'separator').length} actions`);
    menu.popup({ window: options.window });
  });
}
