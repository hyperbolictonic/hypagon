/**
 * The browser seam.
 *
 * Everything the SDK does with a page — primitives, marks, frames, network, input — goes
 * through this interface. The Electron app implements it with `ElectronTarget`; a headless
 * host can implement it with a CDP session. No module below this line imports Electron.
 */

/** When to use: a viewport or page box in CSS pixels. */
export interface BrowserRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** When to use: a captured screenshot and its pixel size. */
export interface BrowserScreenshot {
  /** PNG bytes. */
  png: Uint8Array;
  width: number;
  height: number;
}

/** When to use: one cookie the host browser would send. */
export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  /** Unix seconds, when the host reports an expiry. */
  expires?: number;
}

/** When to use: a synthetic pointer or key event, in CDP terms. */
export type BrowserInputEvent =
  | {
      type: 'mouse';
      action: 'move' | 'down' | 'up';
      x: number;
      y: number;
      button?: 'left' | 'right' | 'middle';
      clickCount?: number;
      modifiers?: number;
    }
  | {
      type: 'key';
      action: 'down' | 'up' | 'char';
      key: string;
      code?: string;
      text?: string;
      modifiers?: number;
    };

/** When to use: a CDP event the network layer or a mark watcher needs. */
export interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
  sessionId?: string;
}

/** When to use: subscribing with `onCdpEvent`. */
export type CdpEventListener = (event: CdpEvent) => void;

/**
 * When to use: anything that drives a page — primitives, marks, frames, network, input.
 * Implement it once per view; the host keeps ownership of the view.
 */
export interface BrowserTarget {
  /** Stable id for logs and marks. */
  readonly id: string;
  readonly kind: 'electron' | 'chrome-cdp' | 'playwright';
  navigate(url: string): Promise<void>;
  evaluate<T = unknown>(script: string, options?: { userGesture?: boolean }): Promise<T>;
  screenshot(options?: { fullPage?: boolean }): Promise<BrowserScreenshot>;
  /** Convenience input; a stealth driver may bypass it and send CDP directly. */
  input(event: BrowserInputEvent): Promise<void>;
  /** The CDP escape hatch. Every adapter is expected to provide one. */
  sendCommand<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
  /** Subscribe to CDP events; returns the unsubscribe function. */
  onCdpEvent(listener: CdpEventListener): () => void;
  /** Adapters that need an explicit debugger or connection may attach here (idempotent). */
  ensureAttached?(): void;
  /** Optional: whether the adapter's CDP session is ready. */
  isAttached?(): boolean;
  /** Notify when the host detaches the debugger or destroys the view; returns the unsubscribe. */
  onDetach?(listener: () => void): () => void;
  cookies(): Promise<BrowserCookie[]>;
  url(): string;
  /** The host owns the view; this releases any adapter-held resources. */
  close(): Promise<void>;
}
