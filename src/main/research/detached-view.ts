/**
 * The shared off-screen research view: one reusable, detached WebContentsView
 * through which every detached read is serialized.
 *
 * Why a module: the chassis carried the view, its operation queue and the
 * load/readiness logic as fields and methods entangled with everything else.
 * Creating and destroying a WebContentsView per call churns renderer processes
 * (Electron 44 has no reliable public destroy), which made repeated
 * crawls/searches flaky — the queue exists so a concurrent detached read can
 * never steal the view from the human hand-off.
 */
import { WebContentsView } from 'electron';

/** When to use: a detached load — wait bounds, a readiness probe and a post-load hook. */
export interface DetachedLoadOptions {
  timeoutMs?: number;
  settleMs?: number;
  readyScript?: string;
  readyMs?: number;
  after?: (wc: Electron.WebContents) => Promise<any>;
}

/** When to use: reading a detached load's outcome — the script result, post-load hook output, HTTP status and content type. */
export interface DetachedLoadResult<T> {
  result: T | null;
  after: any;
  status: number;
  contentType: string | null;
}

/** When to use: building the chassis — the view reads through these two collaborators. */
export interface DetachedViewDeps {
  /** The host fingerprint's UA, set once on the view. */
  userAgent: string;
  /** Wake the research view through CDP before the first read. */
  activate: (wc: Electron.WebContents) => Promise<void>;
}

/** When to use: the chassis — own the shared off-screen research view and its serialized queue. */
export class DetachedViewController {
  private readonly deps: DetachedViewDeps;
  private view: WebContentsView | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(deps: DetachedViewDeps) {
    this.deps = deps;
  }

  /**
   * Run a task that reads or drives the shared off-screen research view.
   *
   * `load` already serializes its own work; this extends the same queue to the
   * human hand-off and anchor capture, which otherwise let a concurrent
   * detached read steal the view.
   */
  withView<T>(task: () => Promise<T>): Promise<T> {
    const p = this.queue.then(task, task);
    this.queue = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  /**
   * Load a URL in the detached view (real Chromium, host fingerprint) and
   * return the result of `script`. Used for reading advertised Markdown/Text
   * alternates and for `search_web` SERPs — without hijacking the active tab.
   * Optionally waits for `readyScript` to become truthy.
   */
  load<T = any>(
    url: string,
    script: string,
    opts: DetachedLoadOptions = {},
  ): Promise<DetachedLoadResult<T>> {
    const run = (): Promise<DetachedLoadResult<T>> =>
      new Promise((resolve) => {
        const wc = this.getView().webContents;
        let settled = false;
        let status = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Detach idempotently: a timed-out load must not leave the listener (or this closure)
        // attached to the shared view.
        let detachNav: () => void = () => undefined;

        const finish = async () => {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          detachNav();
          let result: T | null = null;
          let after: any = null;
          let contentType: string | null = null;
          try {
            contentType = await wc.executeJavaScript('document.contentType || ""').catch(() => '');
            result = (await wc.executeJavaScript(script).catch(() => null)) as T | null;
            if (opts.after) after = await opts.after(wc).catch(() => null);
          } catch {
            /* navigation may have replaced the frame */
          }
          resolve({ result, after, status, contentType: contentType || null });
        };

        const deadlineMs = opts.timeoutMs ?? 12000;
        timer = setTimeout(() => void finish(), deadlineMs);

        const onNav = (_e: unknown, _u: string, code?: number) => {
          status = code || status;
        };
        detachNav = () => {
          if (!wc.isDestroyed()) wc.removeListener('did-navigate', onNav as any);
        };
        wc.on('did-navigate', onNav as any);

        void (async () => {
          // `loadURL` resolves when the navigation *it* started finishes — unlike a bare
          // `did-finish-load` listener, which the initial about:blank document also triggers.
          try {
            await this.deps.activate(wc);
            await wc.loadURL(url);
          } catch {
            /* load error: read whatever committed */
          }
          detachNav();

          // Bounded readiness poll: the committed document must be complete and non-empty, and
          // `readyScript` (if any) must be truthy.
          const deadline = Date.now() + Math.min(opts.readyMs ?? 4000, deadlineMs);
          while (!settled && Date.now() < deadline) {
            const st = await wc
              .executeJavaScript('(() => ({ href: location.href, ready: document.readyState, len: document.body ? document.body.innerHTML.length : 0 }))()')
              .catch(() => null);
            if (st && /^https?:/i.test(st.href) && st.ready === 'complete' && st.len > 0) {
              if (!opts.readyScript) break;
              const extra = await wc.executeJavaScript(opts.readyScript).catch(() => false);
              if (extra) break;
            }
            await new Promise((r) => setTimeout(r, 150));
          }

          if (settled) return;
          if (opts.settleMs) await new Promise((r) => setTimeout(r, opts.settleMs));
          void finish();
        })();
      });

    const p = this.queue.then(run, run);
    this.queue = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  /** The detached view itself, for the human hand-off that shows it to a person. */
  getView(): WebContentsView {
    if (!this.view) {
      const view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
          partition: 'persist:hypagon-research',
        },
      });
      try {
        view.webContents.setUserAgent(this.deps.userAgent);
      } catch {
        /* profile optional */
      }
      view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      this.view = view;
    }
    return this.view;
  }

  /**
   * Load a URL as a *real document navigation* in the detached view and return
   * its text. Used for advertised per-page Markdown/Text alternates so the
   * request carries the full Chromium header + renderer fingerprint (rather
   * than a synthetic fetch profile).
   */
  navigateForText(url: string): Promise<{ body: string | null; contentType: string | null; status: number }> {
    return this.load<{ contentType: string; text: string }>(
      url,
      '(() => { const b = document.body; const t = b ? b.innerText : (document.documentElement ? document.documentElement.innerText : ""); return { contentType: document.contentType || "", text: t }; })()',
      { timeoutMs: 10000 },
    ).then((r) => ({ body: r.result?.text ?? null, contentType: r.result?.contentType ?? null, status: r.status }));
  }
}
