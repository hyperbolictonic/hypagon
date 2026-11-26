/**
 * The Electron adapter for `BrowserTarget`.
 *
 * It imports Electron types only, so the class can be unit-tested with a fake `WebContents`.
 * The host still owns the view; `close()` is a no-op.
 */
import type { WebContents } from 'electron';
import type {
  BrowserCookie,
  BrowserInputEvent,
  BrowserScreenshot,
  BrowserTarget,
  CdpEventListener,
} from '@hyperbolictonic/hypagon-browser';

/** When to use: constructing an adapter — a stable id for logs and marks. */
export interface ElectronTargetOptions {
  id?: string;
}

/** When to use: driving a `WebContents` through the SDK. */
export class ElectronTarget implements BrowserTarget {
  readonly kind = 'electron' as const;
  readonly id: string;
  private readonly webContents: WebContents;

  constructor(webContents: WebContents, options: ElectronTargetOptions = {}) {
    this.webContents = webContents;
    this.id = options.id ?? `electron:${webContents.id}`;
  }

  async navigate(url: string): Promise<void> {
    await this.webContents.loadURL(url);
  }

  async evaluate<T = unknown>(script: string, options: { userGesture?: boolean } = {}): Promise<T> {
    return this.webContents.executeJavaScript(script, options.userGesture === true) as Promise<T>;
  }

  /** Viewport capture. Full-page capture arrives with the CDP adapter. */
  async screenshot(): Promise<BrowserScreenshot> {
    const image = await this.webContents.capturePage();
    const size = image.getSize();
    return { png: image.toPNG(), width: size.width, height: size.height };
  }

  async input(event: BrowserInputEvent): Promise<void> {
    if (event.type === 'mouse') {
      const type =
        event.action === 'move' ? 'mouseMoved' : event.action === 'down' ? 'mousePressed' : 'mouseReleased';
      await this.sendCommand('Input.dispatchMouseEvent', {
        type,
        x: event.x,
        y: event.y,
        button: event.button ?? 'left',
        clickCount: event.clickCount ?? 1,
        modifiers: event.modifiers ?? 0,
      });
      return;
    }

    const type = event.action === 'down' ? 'keyDown' : event.action === 'up' ? 'keyUp' : 'char';
    await this.sendCommand('Input.dispatchKeyEvent', {
      type,
      key: event.key,
      ...(event.code ? { code: event.code } : {}),
      ...(event.text ? { text: event.text } : {}),
      modifiers: event.modifiers ?? 0,
    });
  }

  sendCommand<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string,
  ): Promise<T> {
    return (
      sessionId === undefined
        ? this.webContents.debugger.sendCommand(method, params)
        : this.webContents.debugger.sendCommand(method, params, sessionId)
    ) as Promise<T>;
  }

  onCdpEvent(listener: CdpEventListener): () => void {
    const handler = (
      _event: unknown,
      method: string,
      params: Record<string, unknown>,
      sessionId?: string,
    ): void => {
      listener({ method, params, sessionId });
    };
    this.webContents.debugger.on('message', handler);
    return () => this.webContents.debugger.removeListener('message', handler);
  }

  async cookies(): Promise<BrowserCookie[]> {
    const list = await this.webContents.session.cookies.get({});
    return list.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain ?? '',
      path: cookie.path ?? '/',
      secure: cookie.secure ?? false,
      httpOnly: cookie.httpOnly ?? false,
      ...(cookie.sameSite === 'lax' || cookie.sameSite === 'strict' ? { sameSite: cookie.sameSite } : {}),
      ...(cookie.sameSite === 'no_restriction' ? { sameSite: 'none' as const } : {}),
      ...(cookie.expirationDate === undefined ? {} : { expires: cookie.expirationDate }),
    }));
  }

  url(): string {
    return this.webContents.getURL();
  }

  async close(): Promise<void> {
    // The host owns the WebContents; nothing adapter-specific to release.
  }
}
