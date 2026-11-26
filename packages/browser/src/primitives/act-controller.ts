/**
 * act(): one intent model — click / type / hover / press / focus — that returns a
 * delta, an honest typing verdict and, optionally, an awaited readiness check.
 *
 * Why a module: this was the largest function in the primitives (277 lines). It is
 * four steps, not one: decide how the target is addressed, resolve that address,
 * perform the action (with the input-method ladder), then report. Each step is a
 * method here, so the flow is readable and the addressing rules are not buried in
 * the middle of the typing ladder.
 */
import { diagnosticsScript, inputProbeInstallScript, inputProbeReadScript, type TargetLocator } from './dom-targeting.ts';
import {
  PrimitiveError,
  type ActOptions,
  type PrimitivesHost,
  type TypingChannel,
  type TypingOutcome,
  type WaitResult,
} from './contracts.ts';
import type { WaitCondition } from './options.ts';
import { actSnapshot, type ActSnapshot } from './act-target.ts';
import { ActAddressResolver, type ActPlan, type ResolvedAddress } from './act-address.ts';
import { ActVerdicts } from './act-verdicts.ts';

/** When to use: the facade — the host and the readiness gate act may call. */
export interface ActControllerDeps {
  host: PrimitivesHost;
  waitFor: (conditions: WaitCondition[], opts?: { timeoutMs?: number }) => Promise<WaitResult>;
}

/** When to use: `Primitives` — own the act flow and its evidence. */
export class ActController {
  private readonly deps: ActControllerDeps;
  private readonly address: ActAddressResolver;
  private readonly verdicts: ActVerdicts;

  constructor(deps: ActControllerDeps) {
    this.deps = deps;
    this.address = new ActAddressResolver(deps.host);
    this.verdicts = new ActVerdicts(deps.host);
  }

  /** Resolve the address, act, then report the delta, the verdict and any pending await. */
  async run(opts: ActOptions): Promise<any> {
    const plan = this.plan(opts);
    const startedAt = Date.now();
    const before = actSnapshot(this.deps.host);
    const resolved = await this.resolveAddress(opts, plan);

    if (opts.dryRun) {
      return {
        ok: true,
        dryRun: true,
        action: plan.action,
        markId: plan.markId,
        address: resolved.address,
        target: resolved.target,
        wouldType: plan.action === 'type' ? plan.shownText : undefined,
      };
    }

    this.deps.host.log('action', plan.logLine);

    const typing = await this.perform(opts, plan, resolved);
    // Clicking through an age/CAPTCHA wall is a claim only a human can make. We do not refuse —
    // a human may have explicitly asked for it — but the result says so plainly.
    const gateWarning = plan.action === 'click' ? await this.verdicts.gateWarningFor(resolved.target?.text || '') : undefined;
    const awaited = await this.awaitConditions(opts, resolved, plan.action);
    return this.result(opts, plan, resolved, typing, gateWarning, awaited, before, startedAt);
  }

  /** Validate the address and derive everything the later steps read. */
  private plan(opts: ActOptions): ActPlan {
    const action = opts.action || 'click';
    const hasMark = opts.markId !== undefined && opts.markId !== null && !isNaN(Number(opts.markId));
    const selector = opts.selector ? String(opts.selector) : undefined;
    const px = opts.x !== undefined && !isNaN(Number(opts.x)) ? Number(opts.x) : undefined;
    const py = opts.y !== undefined && !isNaN(Number(opts.y)) ? Number(opts.y) : undefined;
    const hasCoords = px !== undefined && py !== undefined;
    const targetText = opts.targetText ? String(opts.targetText).replace(/\s+/g, ' ').trim() : undefined;
    const hasText = !!targetText;
    const sealedToken = opts.sealedToken ? String(opts.sealedToken) : undefined;
    const hasSealedToken = !!sealedToken;

    if (action !== 'press' && !hasMark && !selector && !hasCoords && !hasText && !hasSealedToken) {
      throw new PrimitiveError(
        'BAD_REQUEST',
        'act needs a target: mark_id, selector, x+y, target_text, or sealed_token (only action="press" is targetless)',
      );
    }

    const markId = hasMark ? Number(opts.markId) : undefined;
    const secret = Boolean(opts.secret);
    const shownText = secret ? '[REDACTED]' : String(opts.text ?? '');
    const logTarget = hasMark ? `#${markId}` : selector ? selector : hasCoords ? `(${px}, ${py})` : hasText ? `text "${targetText}"` : sealedToken ? `sealed ${sealedToken.slice(0, 10)}` : '';

    return {
      action,
      hasMark,
      markId,
      selector,
      hasCoords,
      hasText,
      hasSealedToken,
      px,
      py,
      targetText,
      sealedToken,
      secret,
      shownText,
      logLine: `MCP Directive: act(${action}, ${logTarget || '(targetless)'}${action === 'type' ? `, "${shownText}"` : action === 'press' ? `, "${opts.text || ''}"` : ''}${action === 'type' && opts.clearFirst ? ', clear_first' : ''})`,
    };
  }

  /** Resolve the address into a label, a viewport centre and the control's facts. */
  private resolveAddress(opts: ActOptions, plan: ActPlan): Promise<ResolvedAddress> {
    return this.address.resolve(opts, plan);
  }

  /** Perform the action, including the input-method ladder for a type. */
  private async perform(opts: ActOptions, plan: ActPlan, resolved: ResolvedAddress): Promise<TypingOutcome | null> {
    const host = this.deps.host;
    let typing: TypingOutcome | null = null;

    switch (plan.action) {
      case 'click':
      case 'focus':
        if (plan.hasMark) await host.clickMark(plan.markId!);
        else await host.clickElement(plan.selector, plan.hasCoords || plan.hasText || plan.hasSealedToken ? resolved.center! : undefined);
        return null;
      case 'hover':
        await host.moveMouseTo(resolved.center!);
        return null;
      case 'press':
        await host.pressKey(String(opts.text || 'Enter'));
        return null;
      case 'type': {
        const text = String(opts.text ?? '');
        const clearFirst = opts.clearFirst === true;
        const locator: TargetLocator = plan.hasMark
          ? { markId: plan.markId! }
          : plan.selector
            ? { selector: plan.selector }
            : { point: resolved.center! };
        // Snapshot the control's value and start counting the trusted key/input events
        // that actually reach the page. This is what turns a silent no-op into a verdict.
        if (text.length > 0) await host.evaluate(inputProbeInstallScript(locator)).catch(() => null);

        if (plan.hasMark) {
          await host.typeMark(plan.markId!, text, { secret: plan.secret, clearFirst });
        } else if (plan.selector) {
          await host.typeText(text, plan.selector, { clearFirst });
        } else {
          // Coordinate type: focus the point with a real click first, then type into whatever took focus.
          await host.clickElement(undefined, resolved.center!);
          await host.typeText(text, undefined, { clearFirst });
        }

        if (text.length === 0) return null;
        const probe = await host.evaluate(inputProbeReadScript()).catch(() => null);
        typing = this.verdicts.verdict(probe, text.length, clearFirst);

        // Input-method ladder. Keys are the humanlike default; only when real keystrokes
        // provably reached the page and changed nothing do we try the other channels
        // (CDP insertText, then clipboard paste), re-verifying each. Some web-component
        // fields filter `keydown` entirely, and those accept insertion or paste.
        if (typing && typing.landed === false && typing.keydowns > 0) {
          // Preserve the evidence from the keystroke attempt: each fallback channel gets a fresh
          // probe, and its own counters would otherwise erase the proof that keys *did* arrive
          // (a paste produces no keydowns at all).
          const keyAttempt = typing;
          const attempted: TypingChannel[] = ['keys'];
          for (const channel of ['insertText', 'paste'] as const) {
            await host.evaluate(inputProbeInstallScript(locator)).catch(() => null);
            const sent = channel === 'insertText' ? await host.insertText(text) : await host.pasteText(text);
            const probe2 = await host.evaluate(inputProbeReadScript()).catch(() => null);
            if (!sent) continue;
            const verdict = this.verdicts.verdict(probe2, text.length, false);
            if (!verdict) continue;
            attempted.push(channel);
            typing = {
              ...verdict,
              channel,
              keydowns: Math.max(verdict.keydowns, keyAttempt.keydowns),
              attempted,
            };
            if (verdict.landed) break;
          }
        }
        return typing;
      }
      default:
        throw new PrimitiveError('NOT_SUPPORTED', `Unsupported act action "${plan.action}"`);
    }
  }

  /** The optional readiness check, with a zero-cost diagnostic that runs only on failure. */
  private async awaitConditions(
    opts: ActOptions,
    resolved: ResolvedAddress,
    action: ActPlan['action'],
  ): Promise<WaitResult | null> {
    if (!opts.await || !opts.await.length) return null;
    const awaited = await this.deps.waitFor(opts.await, { timeoutMs: opts.timeoutMs });
    if (awaited.ok) return awaited;
    try {
      const diag = await this.deps.host.evaluate(diagnosticsScript());
      const hints: string[] = [];
      if (!diag?.w || !diag?.h) {
        hints.push(
          'page viewport is 0x0 (window hidden/minimised?) — synthetic input and viewport-scoped marks may not register; make the window visible',
        );
      }
      if (this.deps.host.windowFocused && !this.deps.host.windowFocused()) {
        hints.push(
          'the app window is not focused — Electron drops synthetic input (sendInputEvent) while another window owns focus; call bridge_health / focus the window',
        );
      }
      const active = diag?.active;
      if (action === 'type' && active?.tag && resolved.target?.tag && active.tag !== resolved.target.tag) {
        hints.push(
          `focus is on <${active.tag}${active.label ? ` "${active.label}"` : ''}>, not the target <${resolved.target.tag}> — the click may have been occluded`,
        );
      }
      if (action === 'type' && !active) hints.push('nothing is focused in the page — the click did not land on a focusable control');
      if (hints.length) (awaited as any).hint = hints.join('; ');
    } catch {
      // Diagnostics are best-effort; the failed await is the answer.
    }
    return awaited;
  }

  /** Build the result, record the transition, and turn a provable no-op into a failure. */
  private result(
    opts: ActOptions,
    plan: ActPlan,
    resolved: ResolvedAddress,
    typing: TypingOutcome | null,
    gateWarning: string | undefined,
    awaited: WaitResult | null,
    before: ActSnapshot,
    startedAt: number,
  ): any {
    const after = actSnapshot(this.deps.host);
    const durationMs = Date.now() - startedAt;

    // The verdict the tool used to omit entirely: `type` reported success whether or not
    // anything was typed. A provable no-op is now a structured failure, not a summary.
    const typingFailed = typing !== null && typing.landed === false;
    const typingHint = typingFailed
      ? this.verdicts.hint(typing!)
      : typing?.unobservable
        ? 'Keystrokes were delivered, but the control is inside a closed shadow root, so its value cannot be verified from page JS. Confirm the effect through the UI instead of retrying.'
        : undefined;
    const ok = !typingFailed;
    const hints = [(awaited as any)?.hint, typingHint, gateWarning].filter(Boolean).join('; ') || undefined;

    // Record the transition: this is the dataset a runner-side decision model learns from.
    // Never the typed text — only its length, plus whether it landed.
    this.deps.host.recordTransition?.({
      ts: Date.now(),
      action: plan.action,
      addressMode: plan.hasMark ? 'mark_id' : plan.selector ? 'selector' : plan.hasCoords ? 'coords' : 'none',
      address: resolved.address,
      target: resolved.target || undefined,
      url: after.url,
      revisionBefore: before.revision,
      revisionAfter: after.revision,
      marksBefore: before.marks,
      marksAfter: after.marks,
      urlChanged: before.url !== after.url,
      marksChanged: before.marks !== after.marks,
      ok,
      awaitOk: awaited ? awaited.ok : undefined,
      hints,
      durationMs,
      typed:
        plan.action === 'type'
          ? { chars: String(opts.text ?? '').length, secret: plan.secret, landed: typing ? typing.landed : undefined }
          : undefined,
      typing: typing || undefined,
      clearFirst: plan.action === 'type' ? opts.clearFirst === true : undefined,
    });

    const result: any = {
      ok,
      action: plan.action,
      markId: plan.markId,
      address: resolved.address,
      target: resolved.target,
      typed: plan.action === 'type' ? plan.shownText : undefined,
      delta: {
        urlChanged: before.url !== after.url,
        beforeUrl: before.url,
        afterUrl: after.url,
        revisionBefore: before.revision,
        revisionAfter: after.revision,
        marksBefore: before.marks,
        marksAfter: after.marks,
      },
      awaited,
      durationMs,
    };

    if (typing) result.typing = typing;
    if (gateWarning) result.warning = gateWarning;
    if (typingFailed) {
      result.error = {
        code: 'TYPE_NO_EFFECT',
        message: `Typing had no effect on ${resolved.target?.tag ? `<${resolved.target.tag}>` : 'the target'} (value length ${typing!.beforeLength} → ${typing!.afterLength}).`,
        hint: typingHint,
      };
    }

    return result;
  }
}
