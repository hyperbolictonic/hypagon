/**
 * The in-page hand-off banner: its script, injection, removal, refresh and the
 * reload helper.
 *
 * Why a module: the banner is a page-side program plus three lifecycle calls.
 * The manager only decides *when* a request needs one; this owns the script and
 * the enabled flag.
 */
import type { WebContents } from 'electron';
import type { HilRequest } from './hil-types.js';

/** When to use: `inject` — the banner markup, wired to the local resolve route. */
export function hilBannerScript(request: HilRequest): string {
  // The page gets these as JSON string literals: interpolating into the page's own template
  // literal would either throw (`request` does not exist in the page) or break on a backtick.
  const reason = JSON.stringify(String(request.reason ?? '').replace(/</g, '&lt;'));
  const id = JSON.stringify(String(request.id ?? ''));
  return `
      (function() {
        try {
          const old = document.getElementById('__kuang_hil_banner');
          if (old) old.remove();

          const container = document.createElement('div');
          container.id = '__kuang_hil_banner';
          container.setAttribute('style', [
            'position: fixed',
            'top: 14px',
            'left: 50%',
            'transform: translateX(-50%)',
            'z-index: 2147483647',
            'background: rgba(18, 18, 24, 0.96)',
            'color: #f43f5e',
            'border: 2px solid #f59e0b',
            'box-shadow: 0 8px 32px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.6)',
            'border-radius: 8px',
            'padding: 12px 20px',
            'display: flex',
            'align-items: center',
            'gap: 16px',
            'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            'font-size: 13px',
            'max-width: 90vw',
            'animation: __kuang_pulse 2s infinite ease-in-out'
          ].join(';'));

          const style = document.createElement('style');
          style.id = '__kuang_hil_style';
          style.textContent = \`
            @keyframes __kuang_pulse {
              0%, 100% { border-color: #f59e0b; box-shadow: 0 0 16px rgba(245, 158, 11, 0.5); }
              50% { border-color: #ef4444; box-shadow: 0 0 24px rgba(239, 68, 68, 0.7); }
            }
          \`;
          document.head.appendChild(style);

          container.innerHTML =
            '<div style="display:flex; align-items:center; gap:8px;">' +
              '<span style="font-size:18px;">⚠️</span>' +
              '<div>' +
                '<div style="font-weight:bold; color:#fbbf24; text-transform:uppercase; letter-spacing:1px; font-size:11px;">Human Intervention Required</div>' +
                '<div style="color:#ffffff; margin-top:2px;">' + ${reason} + '</div>' +
              '</div>' +
            '</div>' +
            '<div style="display:flex; align-items:center; gap:8px; margin-left:12px;">' +
              '<button id="__kuang_hil_done_btn" style="background:#10b981; color:#ffffff; border:none; padding:6px 14px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; font-family:monospace; box-shadow:0 0 8px rgba(16,185,129,0.5);">' +
                'RESUME AGENT (DONE)' +
              '</button>' +
            '</div>';

          document.body.appendChild(container);

          const doneBtn = document.getElementById('__kuang_hil_done_btn');
          if (doneBtn) {
            doneBtn.onclick = function() {
              doneBtn.textContent = 'RESUMING...';
              doneBtn.style.background = '#64748b';
              fetch('http://127.0.0.1:4111/hil/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: ${id}, notes: 'User confirmed via in-page banner' })
              }).catch(() => {});
            };
          }
        } catch (e) {
          console.warn('[Kuang Grade] Banner injection notice:', e);
        }
      })();
    `;
}

/** When to use: `remove` — drop the banner and its keyframes. */
export function hilBannerRemovalScript(): string {
  return `
      (function() {
        try {
          const b = document.getElementById('__kuang_hil_banner');
          if (b) b.remove();
          const s = document.getElementById('__kuang_hil_style');
          if (s) s.remove();
        } catch {}
      })();
    `;
}

/** When to use: constructing the manager — the page lookups are injected. */
export interface HilPageBannerDeps {
  getActiveWebContents: () => WebContents | null;
  /** The pending request, so a refresh can re-inject it. */
  activeRequest: () => HilRequest | null;
}

/** When to use: `HilManager` — own the page banner for the active hand-off. */
export class HilPageBanner {
  /** Whether the banner should be shown at all for the current request. */
  enabled = true;

  private readonly deps: HilPageBannerDeps;

  constructor(deps: HilPageBannerDeps) {
    this.deps = deps;
  }

  inject(request: HilRequest): void {
    const wc = this.deps.getActiveWebContents();
    if (!wc || wc.isDestroyed()) return;
    void wc.executeJavaScript(hilBannerScript(request)).catch(() => {});
  }

  remove(wc?: WebContents | null): void {
    const target = wc ?? this.deps.getActiveWebContents();
    if (!target || target.isDestroyed()) return;
    void target.executeJavaScript(hilBannerRemovalScript()).catch(() => {});
  }

  /**
   * Re-injects the banner into the active page. A challenge page usually navigates once solved,
   * which wipes the original banner — without this the human loses the RESUME affordance.
   */
  refresh(): void {
    if (!this.enabled) return;
    const request = this.deps.activeRequest();
    if (!request || request.status !== 'pending') return;
    this.inject(request);
  }

  /** Reloads the page under hand-off (a stale challenge often clears on refresh). */
  reload(): boolean {
    const request = this.deps.activeRequest();
    if (!request || request.status !== 'pending') return false;
    const wc = this.deps.getActiveWebContents();
    if (!wc || wc.isDestroyed()) return false;
    wc.reload();
    return true;
  }
}
