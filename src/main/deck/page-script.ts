/**
 * Run a best-effort script in the active page.
 *
 * Why a module: every collab interaction (enter/exit mode, show a thread, toast)
 * is an in-page call that must never throw when the tab is mid-navigation. The
 * controller and the note cycle both need the same guard.
 */

/** When to use: any collab in-page call — returns undefined when the tab is gone. */
export function runInPage(activeWebContents: () => Electron.WebContents, script: string): Promise<unknown> | undefined {
  try {
    return activeWebContents()
      .executeJavaScript(script)
      .catch(() => undefined);
  } catch {
    return undefined;
  }
}
