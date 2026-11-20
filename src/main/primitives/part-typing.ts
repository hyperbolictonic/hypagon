/**
 * Primitives part: typing.
 */
import type { FieldFacts, TypingOutcome } from '../telemetry/action-ledger.js';
import { targetBoxScript, fieldFactsScript } from './dom-targeting.js';
import type { TargetBox, TargetLocator } from './dom-targeting.js';
import { detectSensitiveGate } from '../decide/sensitive-gate.js';
import { PrimitiveError } from './error.js';
import { PrimitivesWait } from './part-wait.js';

/** When to use: the typing part of the primitives chain, composed into the public class. */
export class PrimitivesTyping extends PrimitivesWait {

  /**
   * Turn the input probe into a verdict.
   *
   * `landed: false` means the field's value did not change and no trusted key events reached
   * the page — the silent no-op this tool used to report as success. The event counters
   * separate the two causes so the hint can name the right remedy:
   *
   *   no events at all      → the input never arrived (focus/window), fix the target
   *   events, value unmoved → the control rejects synthetic input (OTP/one-time-code), hand over
   */
  protected verdictForTyping(probe: any, typedChars: number, clearFirst: boolean): TypingOutcome | null {
    if (!probe) return null;
    const base = {
      beforeLength: Number(probe.beforeLength || 0),
      afterLength: probe.afterLength === null || probe.afterLength === undefined ? null : Number(probe.afterLength),
      changed: probe.changed === null || probe.changed === undefined ? null : Boolean(probe.changed),
      keydowns: Number(probe.keydowns || 0),
      beforeinputs: Number(probe.beforeinputs || 0),
      inputs: Number(probe.inputs || 0),
      detached: probe.detached === true,
    };
    // Re-rendered mid-type (React/Lit swapped the node): no verdict is possible.
    if (base.detached || base.afterLength === null) return { ...base, landed: null };
    // A closed-shadow target exposes events but not its value; the keystrokes may be fine.
    if (probe.observable === false) return { ...base, landed: null, unobservable: true };

    const noEventsAtAll = base.keydowns === 0 && base.beforeinputs === 0 && base.inputs === 0;
    // clear_first + retyping the identical value leaves the length unchanged but is not a no-op.
    const identicalRetype = clearFirst && base.afterLength > 0 && base.afterLength === typedChars;
    const landed = noEventsAtAll ? false : base.changed === true || identicalRetype;
    return { ...base, landed, channel: 'keys', attempted: ['keys'] };
  }


  /**
   * Warn when a click target looks like an age/CAPTCHA gate control. Only the page copy decides
   * whether a gate is present — the target's own label merely triggers the (single) page read, so
   * ordinary "Continue" buttons on normal pages cost one extra evaluate at worst.
   */
  protected async gateWarningFor(targetText: string): Promise<string | undefined> {
    if (!targetText || !/verify|continue|enter|age|birthday|18|captcha|robot|human|i'?m/i.test(targetText)) return undefined;
    const pageText = await this.host
      .evaluate('(document.body ? document.body.innerText : "").slice(0, 1500)')
      .catch(() => '');
    const gate = detectSensitiveGate(pageText, { url: this.host.getPageInfo().url });
    if (!gate) return undefined;
    const kind = gate.kind === 'age_verification' ? 'age-verification' : 'CAPTCHA';
    return `"${targetText.slice(0, 60)}" sits behind a ${kind} wall. If a human has not resolved the hand-off, stop and call request_human_intervention.`;
  }


  protected typingHint(t: TypingOutcome): string {    if (t.keydowns === 0) {
      return 'No trusted key events reached the page — focus was not on the target (the click may have been occluded) or the app window is not focused. Re-check with act(action:"focus") or bridge_health.';
    }
    if (t.channel && t.channel !== 'keys') {
      return `The control rejected every input channel — keystrokes, CDP text insertion and clipboard paste (value ${t.beforeLength} → ${t.afterLength}, keydowns ${t.keydowns}). It enforces its own input rules (a code field or a masked widget); call request_human_intervention rather than retrying.`;
    }
    return `The control received ${t.keydowns} key event(s) and ${t.beforeinputs} beforeinput event(s) but its value did not change — it rejects synthetic input. One-time-code/OTP inputs and some framework-controlled fields behave this way; call request_human_intervention instead of retrying.`;
  }


  /**
   * Resolve a locator to the box of the control to act on, scrolling it into view.
   * Shadow-aware: a selector naming a custom-element host resolves to the inner control
   * a mouse would hit (see dom-targeting.ts).
   */
  protected async resolveTargetBox(locator: TargetLocator): Promise<TargetBox | null> {
    const res = (await this.host.evaluate(targetBoxScript(locator)).catch(() => null)) as TargetBox | null;
    if (!res || typeof res.x !== 'number' || typeof res.y !== 'number') return null;
    // A tab that has never been laid out reports a 0x0 viewport and geometry that has
    // nothing to do with the page (this produced a silent click at (31, 0) on a fixture
    // whose button was at (231, 90)). Fail loudly instead of acting on nonsense.
    if (res.vw === 0 || res.vh === 0) {
      throw new PrimitiveError(
        'NO_TARGET',
        'The page viewport is 0x0, so no target can be resolved — the tab has not been laid out yet (the window may be hidden or minimised). Make the window visible and retry.',
        { selector: locator.selector }
      );
    }
    return res;
  }


  /**
   * Typed facts about the form control an action addressed (null when the target isn't a control).
   *
   * This is what lets a decision layer answer *"should I pass clear_first?"* (`prefilled`) or triage a
   * click that appeared to do nothing (`disabled`) from **data** instead of guessing. Surfaced in the
   * `act` result as `target.field`, including on `dry_run` — so it can be pre-flighted without acting.
   *
   * Resolution is shadow-aware, so a web-component field reports its real `<input>` (and real value
   * length) rather than the custom-element host, which is not input-like and would probe as `null`.
   */
  protected async probeField(locator: TargetLocator): Promise<FieldFacts | null> {
    const facts = await this.host.evaluate(fieldFactsScript(locator)).catch(() => null);
    return facts && typeof facts.tag === 'string' ? (facts as FieldFacts) : null;
  }


  protected liteSnapshot() {
    const info = this.host.getPageInfo();
    return { revision: this.host.revision(), url: info.url, title: info.title, marks: this.host.getMarks().length };
  }
}
