/**
 * The verdicts act reports after it acts: did the typing land, and is the target
 * behind a human-only gate.
 *
 * Why a module: none of these decide *what* to do — they read the page after the
 * fact and turn it into evidence plus a remedy. Keeping them out of the flow means
 * `act` reads as resolve → perform → report.
 */
import type { PrimitivesHost, TypingOutcome } from './contracts.ts';

/** When to use: `ActController` — the typing/verdict and gate-warning reads. */
export class ActVerdicts {
  private readonly host: PrimitivesHost;

  constructor(host: PrimitivesHost) {
    this.host = host;
  }

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
  verdict(probe: any, typedChars: number, clearFirst: boolean): TypingOutcome | null {
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

  /** The remedy for a typing verdict that did not land: name the cause, then the next call. */
  hint(t: TypingOutcome): string {
    if (t.keydowns === 0) {
      return 'No trusted key events reached the page — focus was not on the target (the click may have been occluded) or the app window is not focused. Re-check with act(action:"focus") or bridge_health.';
    }
    if (t.channel && t.channel !== 'keys') {
      return `The control rejected every input channel — keystrokes, CDP text insertion and clipboard paste (value ${t.beforeLength} → ${t.afterLength}, keydowns ${t.keydowns}). It enforces its own input rules (a code field or a masked widget); call request_human_intervention rather than retrying.`;
    }
    return `The control received ${t.keydowns} key event(s) and ${t.beforeinputs} beforeinput event(s) but its value did not change — it rejects synthetic input. One-time-code/OTP inputs and some framework-controlled fields behave this way; call request_human_intervention instead of retrying.`;
  }

  /**
   * Warn when a click target looks like an age/CAPTCHA gate control. Only the page copy decides
   * whether a gate is present — the target's own label merely triggers the (single) page read, so
   * ordinary "Continue" buttons on normal pages cost one extra evaluate at worst.
   */
  async gateWarningFor(targetText: string): Promise<string | undefined> {
    if (!targetText || !/verify|continue|enter|age|birthday|18|captcha|robot|human|i'?m/i.test(targetText)) return undefined;
    const pageText = await this.host
      .evaluate('(document.body ? document.body.innerText : "").slice(0, 1500)')
      .catch(() => '');
    const gate = this.host.detectSensitiveGate?.(pageText, { url: this.host.getPageInfo().url }) ?? null;
    if (!gate) return undefined;
    const kind = gate.kind === 'age_verification' ? 'age-verification' : 'CAPTCHA';
    return `"${targetText.slice(0, 60)}" sits behind a ${kind} wall. If a human has not resolved the hand-off, stop and call request_human_intervention.`;
  }
}
