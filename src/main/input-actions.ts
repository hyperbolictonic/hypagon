/**
 * Humanized input actions over the active tab: click, type, fill a form, scroll.
 *
 * Why a module: the four actions carried the chassis's largest remaining logic —
 * click target resolution through shadow roots plus the focus-verification nudge,
 * the per-field form dispatch (checkbox/select/text branches), and the
 * wheel-swallow fallback for scroll. They read through the simulator and report
 * the agent's state through injected hooks, so the chassis keeps the state and
 * the controller owns how an action is performed.
 *
 * The trusted CDP click already actuates the element: no synthetic `el.click()` is
 * fired on top of it — that double-submitted forms and double-opened links.
 */
import type { WebContents } from 'electron';
import { targetBoxScript, focusControlScript, type TargetBox } from './primitives/dom-targeting.js';
import type { HumanizedInputSimulator } from './telemetry/input-simulator.js';

/** When to use: building the chassis — the state surface the actions report through. */
export interface InputActionsStatus {
  /** Agent starts acting; the state is broadcast when the action ends. */
  acting(): void;
  /** Agent finished; sets IDLE and broadcasts. */
  idle(): void;
  /** The action cannot proceed; sets ERROR and broadcasts. */
  error(): void;
}

/** When to use: building the chassis — everything an input action reads through. */
export interface InputActionsDeps {
  activeWebContents: () => WebContents;
  simulator: () => HumanizedInputSimulator;
  status: InputActionsStatus;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
  bumpRevision: () => void;
}

/** When to use: the chassis — own how input actions are performed over the active tab. */
export class InputActionsController {
  private readonly deps: InputActionsDeps;

  constructor(deps: InputActionsDeps) {
    this.deps = deps;
  }

  async clickElement(selector?: string, coordinates?: { x: number; y: number }): Promise<string> {
    const wc = this.deps.activeWebContents();
    this.deps.status.acting();

    let targetX = coordinates?.x;
    let targetY = coordinates?.y;
    let targetTag: string | undefined;
    let viaShadowRoot = false;

    if (selector) {
      this.deps.log('action', `MCP Directive: click_element(selector="${selector}")`);
      const box = (await wc.executeJavaScript(targetBoxScript({ selector })).catch(() => null)) as TargetBox | null;

      if (!box) {
        this.deps.status.error();
        throw new Error(`Target element not found: ${selector}`);
      }
      if (box.vw === 0 || box.vh === 0) {
        this.deps.status.error();
        throw new Error(
          'Page viewport is 0x0 — the tab is not laid out yet (window hidden or minimised?), so the target box is meaningless. Make the window visible and retry.'
        );
      }

      // The selector resolves to the control a *mouse* would hit — through shadow roots,
      // and past a custom-element host whose centre sits on a label rather than the input.
      targetX = box.x;
      targetY = box.y;
      targetTag = box.tag;
      viaShadowRoot = box.sameAsHost === false;
    } else if (targetX !== undefined && targetY !== undefined) {
      this.deps.log('action', `MCP Directive: click_element(x=${targetX}, y=${targetY})`);
    } else {
      throw new Error('Must provide either selector or coordinates');
    }

    await this.deps.simulator().clickAt(wc, { x: targetX!, y: targetY! });

    // The focus nudge is applied to the **resolved control**, never to a custom-element
    // host: `host.focus()` either moves focus off the inner <input> or does nothing, and
    // either way the keystrokes that follow go nowhere (the silent-typing bug in
    // docs/FIELD_NOTES_2026-10-20_SIGNUP.md). The result is reported, not assumed.
    let focusReport: { focused: boolean | null; tag?: string; activeTag?: string } | null = null;
    if (selector) {
      focusReport = (await wc.executeJavaScript(focusControlScript({ selector })).catch(() => null)) as {
        focused: boolean | null;
        tag?: string;
        activeTag?: string;
      } | null;
    }
    this.deps.status.idle();
    this.deps.bumpRevision();

    if (focusReport && focusReport.focused === false && focusReport.tag) {
      this.deps.log(
        'warn',
        `Click reached <${targetTag || '?'}> but focus is on <${focusReport.activeTag || 'nothing'}> — the control may be occluded or not focusable.`
      );
    }

    const label = targetTag ? `<${targetTag}>` : 'element';
    return `Clicked ${label} at (${targetX}, ${targetY})${viaShadowRoot ? ' (resolved inside a shadow root)' : ''}`;
  }

  async typeText(text: string, selector?: string, opts: { clearFirst?: boolean } = {}): Promise<string> {
    const wc = this.deps.activeWebContents();
    this.deps.status.acting();
    this.deps.log('action', `MCP Directive: type_text("${text.substring(0, 15)}..."${selector ? ` on ${selector}` : ''}${opts.clearFirst ? ' clear_first' : ''})`);

    if (selector) {
      await this.clickElement(selector);
    }

    if (opts.clearFirst) {
      await this.deps.simulator().clearFocusedField(wc);
    }

    await this.deps.simulator().typeText(wc, text);
    this.deps.status.idle();
    this.deps.bumpRevision();
    return `Typed text (${text.length} chars) with variable human cadence`;
  }

  async fillForm(
    fields: Record<string, string | boolean | number>,
    submitSelector?: string
  ): Promise<{ success: boolean; fieldsFilled: number; submitted: boolean; details: string[] }> {
    const wc = this.deps.activeWebContents();
    this.deps.status.acting();
    this.deps.log('action', `MCP Directive: fill_form(${Object.keys(fields).length} fields${submitSelector ? `, submit="${submitSelector}"` : ''})`);

    const details: string[] = [];
    let fieldsFilled = 0;

    for (const [selector, value] of Object.entries(fields)) {
      try {
        const info = await wc.executeJavaScript(`
          (() => {
            const el = document.querySelector(${JSON.stringify(selector)});
            if (!el) return null;
            el.scrollIntoView({ behavior: 'auto', block: 'center' });
            const rect = el.getBoundingClientRect();
            return {
              tagName: el.tagName.toUpperCase(),
              type: (el.getAttribute('type') || '').toLowerCase(),
              currentVal: (el as any).value,
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            };
          })()
        `);

        if (!info) {
          details.push(`Field skipped (not found): ${selector}`);
          continue;
        }

        await this.deps.simulator().clickAt(wc, { x: info.x, y: info.y });

        if (info.type === 'checkbox' || info.type === 'radio') {
          await wc.executeJavaScript(`
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (el && typeof (el as any).checked === 'boolean') {
                const target = ${JSON.stringify(Boolean(value))};
                if ((el as any).checked !== target) {
                  (el as any).click();
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            })()
          `);
          details.push(`Toggled ${info.type} [${selector}] -> ${value}`);
        } else if (info.tagName === 'SELECT') {
          await wc.executeJavaScript(`
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (el) {
                (el as any).value = ${JSON.stringify(String(value))};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            })()
          `);
          details.push(`Selected option [${selector}] -> "${value}"`);
        } else {
          await wc.executeJavaScript(`
            (() => {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (el) {
                if (typeof (el as any).focus === 'function') (el as any).focus();
                (el as any).value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            })()
          `);
          await this.deps.simulator().typeText(wc, String(value));
          details.push(`Typed [${selector}] -> "${String(value)}"`);
        }

        fieldsFilled++;
        await new Promise((r) => setTimeout(r, 120 + Math.random() * 120));
      } catch (err: any) {
        details.push(`Error filling [${selector}]: ${err.message}`);
      }
    }

    let submitted = false;
    if (submitSelector) {
      try {
        await this.clickElement(submitSelector);
        submitted = true;
        details.push(`Clicked submit button [${submitSelector}]`);
      } catch (err: any) {
        details.push(`Failed to click submit button [${submitSelector}]: ${err.message}`);
      }
    }

    this.deps.status.idle();

    this.deps.bumpRevision();
    return {
      success: fieldsFilled > 0,
      fieldsFilled,
      submitted,
      details,
    };
  }

  async scrollPage(direction: 'up' | 'down', amount: number = 400): Promise<string> {
    const wc = this.deps.activeWebContents();
    this.deps.status.acting();
    this.deps.log('action', `MCP Directive: scroll_page(${direction}, ${amount}px)`);

    const deltaY = direction === 'down' ? amount : -amount;
    const readScroll = () =>
      wc
        .executeJavaScript(
          `(() => { const el = document.scrollingElement || document.documentElement; return { y: Math.round(window.scrollY || el.scrollTop || 0) }; })()`
        )
        .catch(() => null);
    const before = await readScroll();

    await this.deps.simulator().scrollPage(wc, deltaY);

    // A wheel event lands on whatever is under the cursor. On pages with a fixed header, a
    // cookie layer or a custom inner scroller, the wheel is swallowed and the "successful" call
    // moves nothing (seen on Mobalytics: html is 2 783px tall, scrollY stayed 0). Verify, and
    // fall back to scrolling the real scroller under the viewport centre.
    const after = await readScroll();
    let usedFallback = false;
    if (before && after && Math.abs(after.y - before.y) < 2) {
      const fallback = await wc
        .executeJavaScript(
          `(() => {
            const delta = ${deltaY};
            const doc = document.scrollingElement || document.documentElement;
            let node = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
            let inner = null;
            while (node && node !== document.body && node !== document.documentElement) {
              const st = getComputedStyle(node);
              if (node.scrollHeight > node.clientHeight + 40 && /auto|scroll|overlay/.test(st.overflowY)) { inner = node; break; }
              node = node.parentElement;
            }
            const y0 = inner ? inner.scrollTop : doc.scrollTop;
            (inner || doc).scrollBy(0, delta);
            const y1 = inner ? inner.scrollTop : doc.scrollTop;
            return JSON.stringify({ target: inner ? 'inner' : 'document', before: Math.round(y0), after: Math.round(y1) });
          })()`
        )
        .catch(() => null);
      usedFallback = true;
      this.deps.log('info', `scroll_page fell back to the real scroller: ${fallback || 'unknown'}`);
    }

    this.deps.status.idle();
    this.deps.bumpRevision();
    return `Scrolled ${direction} by ${amount}px${usedFallback ? ' (wheel was swallowed — scrolled the active scroll container instead)' : ''}`;
  }
}
