/**
 * Primitives part: act.
 */
import type { FieldFacts, TypingOutcome, TypingChannel } from '../telemetry/action-ledger.js';
import { diagnosticsScript, inputProbeInstallScript, inputProbeReadScript } from './dom-targeting.js';
import type { TargetLocator } from './dom-targeting.js';
import { textTargetExpression, parseTextTargets } from './text-target.js';
import type { WaitResult, ActOptions } from './types.js';
import { PrimitiveError } from './error.js';
import { PrimitivesTyping } from './part-typing.js';

/** When to use: the act part of the primitives chain, composed into the public class. */
export class PrimitivesAct extends PrimitivesTyping {

  public async act(opts: ActOptions): Promise<any> {
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
        'act needs a target: mark_id, selector, x+y, target_text, or sealed_token (only action="press" is targetless)'
      );
    }

    const markId = hasMark ? Number(opts.markId) : undefined;
    const startedAt = Date.now();
    const before = this.liteSnapshot();
    const secret = Boolean(opts.secret);
    const shownText = secret ? '[REDACTED]' : String(opts.text ?? '');

    // The address resolves to a human label plus, where one is needed, a live viewport
    // centre (hover, coordinate clicks, and the focus-click that precedes a coordinate type).
    let center: { x: number; y: number } | null = null;
    let address = '';
    let target: { id?: number; tag?: string; text?: string; selector?: string; center?: { x: number; y: number }; field?: FieldFacts } | null = null;

    if (action !== 'press') {
      if (hasMark) {
        let hit = await this.host.getMarkTarget(markId!);
        if (!hit && opts.includeOffscreen !== false) {
          // Mark registry may be cold (fresh tab / no scan yet) — refresh once.
          await this.host.injectMarks({ includeOffscreen: true });
          hit = await this.host.getMarkTarget(markId!);
        }
        if (!hit) {
          throw new PrimitiveError('STALE_REF', `Mark #${markId} could not be resolved. Re-run observe/find to refresh refs.`, { markId });
        }
        center = hit.currentCenter;
        address = `#${markId}`;
        target = { id: hit.mark.id, tag: hit.mark.tag, text: secret ? '[REDACTED]' : hit.mark.text, center };
        const markFacts = await this.probeField({ markId: markId! });
        if (markFacts) target.field = markFacts;
      } else if (hasText) {
        const rawTargets = await this.host
          .evaluate(textTargetExpression(targetText!, { exact: opts.targetExact === true, max: 8 }))
          .catch(() => null);
        const found = parseTextTargets(rawTargets);
        if (!found.matches.length) {
          throw new PrimitiveError('NO_TARGET', `No visible element contains "${targetText}"`, { targetText });
        }
        if (found.matches.length > 1) {
          throw new PrimitiveError(
            'AMBIGUOUS',
            `"${targetText}" matches ${found.matches.length} elements — pass a longer string or a mark id`,
            { targetText, candidates: found.matches.slice(0, 5) }
          );
        }
        const match = found.matches[0];
        center = { x: match.x, y: match.y };
        address = `text "${match.text}"`;
        target = { tag: match.tag, text: match.text, center };
        const pointFacts = await this.probeField({ point: center });
        if (pointFacts) target.field = pointFacts;
      } else if (selector) {
        const box = await this.resolveTargetBox({ selector });
        if (!box) throw new PrimitiveError('NO_TARGET', `Selector "${selector}" matched no visible element`, { selector });
        center = { x: box.x, y: box.y };
        address = selector;
        target = { selector, tag: box.tag, text: box.text, center };
        const selFacts = await this.probeField({ selector });
        if (selFacts) target.field = selFacts;
      } else if (hasCoords) {
        center = { x: px!, y: py! };
        address = `(${px}, ${py})`;
        target = { center };
        const pointFacts = await this.probeField({ point: center });
        if (pointFacts) target.field = pointFacts;
      } else if (hasSealedToken) {
        if (!this.host.resolveSealedToken) {
          throw new PrimitiveError('NOT_SUPPORTED', 'Sealed tokens are not available in this build.');
        }
        const resolved = await this.host.resolveSealedToken(sealedToken!);
        if (!resolved) {
          throw new PrimitiveError('STALE_REF', 'The sealed target expired or the frame navigated. Re-run find(sealed:true).');
        }
        center = resolved.center;
        address = `sealed ${sealedToken!.slice(0, 10)}`;
        target = { text: 'sealed control', center };
        const pointFacts = await this.probeField({ point: center });
        if (pointFacts) target.field = pointFacts;
      }
    }

    if (opts.dryRun) {
      return {
        ok: true,
        dryRun: true,
        action,
        markId,
        address,
        target,
        wouldType: action === 'type' ? shownText : undefined,
      };
    }

    this.host.log('action', `MCP Directive: act(${action}, ${address || '(targetless)'}${action === 'type' ? `, "${shownText}"` : action === 'press' ? `, "${opts.text || ''}"` : ''}${action === 'type' && opts.clearFirst ? ', clear_first' : ''})`);

    /** Typing verdict, when the action was a type and the target resolved to a control. */
    let typing: TypingOutcome | null = null;

    switch (action) {
      case 'click':
      case 'focus':
        if (hasMark) await this.host.clickMark(markId!);
        else await this.host.clickElement(selector, hasCoords || hasText || hasSealedToken ? center! : undefined);
        break;
      case 'hover':
        await this.host.moveMouseTo(center!);
        break;
      case 'type': {
        const text = String(opts.text ?? '');
        const clearFirst = opts.clearFirst === true;
        const locator: TargetLocator = hasMark ? { markId: markId! } : selector ? { selector } : { point: center! };
        // Snapshot the control's value and start counting the trusted key/input events
        // that actually reach the page. This is what turns a silent no-op into a verdict.
        if (text.length > 0) await this.host.evaluate(inputProbeInstallScript(locator)).catch(() => null);

        if (hasMark) {
          await this.host.typeMark(markId!, text, { secret, clearFirst });
        } else if (selector) {
          await this.host.typeText(text, selector, { clearFirst });
        } else {
          // Coordinate type: focus the point with a real click first, then type into whatever took focus.
          await this.host.clickElement(undefined, center!);
          await this.host.typeText(text, undefined, { clearFirst });
        }

        if (text.length > 0) {
          const probe = await this.host.evaluate(inputProbeReadScript()).catch(() => null);
          typing = this.verdictForTyping(probe, text.length, clearFirst);

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
              await this.host.evaluate(inputProbeInstallScript(locator)).catch(() => null);
              const sent = channel === 'insertText' ? await this.host.insertText(text) : await this.host.pasteText(text);
              const probe2 = await this.host.evaluate(inputProbeReadScript()).catch(() => null);
              if (!sent) continue;
              const verdict = this.verdictForTyping(probe2, text.length, false);
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
        }
        break;
      }
      case 'press':
        await this.host.pressKey(String(opts.text || 'Enter'));
        break;
      default:
        throw new PrimitiveError('NOT_SUPPORTED', `Unsupported act action "${action}"`);
    }

    // Clicking through an age/CAPTCHA wall is a claim only a human can make. We do not refuse —
    // a human may have explicitly asked for it — but the result says so plainly.
    const gateWarning = action === 'click' ? await this.gateWarningFor(target?.text || '') : undefined;

    let awaited: WaitResult | null = null;
    if (opts.await && opts.await.length) {
      awaited = await this.waitFor(opts.await, { timeoutMs: opts.timeoutMs });
      if (!awaited.ok) {
        // Zero-cost diagnostic: only runs on failure, so the happy path stays one round trip.
        try {
          const diag = await this.host.evaluate(diagnosticsScript());
          const hints: string[] = [];
          if (!diag?.w || !diag?.h) hints.push('page viewport is 0x0 (window hidden/minimised?) — synthetic input and viewport-scoped marks may not register; make the window visible');
          if (this.host.windowFocused && !this.host.windowFocused()) hints.push('the app window is not focused — Electron drops synthetic input (sendInputEvent) while another window owns focus; call bridge_health / focus the window');
          const active = diag?.active;
          if (action === 'type' && active?.tag && target?.tag && active.tag !== target.tag) {
            hints.push(`focus is on <${active.tag}${active.label ? ` "${active.label}"` : ''}>, not the target <${target.tag}> — the click may have been occluded`);
          }
          if (action === 'type' && !active) hints.push('nothing is focused in the page — the click did not land on a focusable control');
          if (hints.length) (awaited as any).hint = hints.join('; ');
        } catch {}
      }
    }

    const after = this.liteSnapshot();
    const durationMs = Date.now() - startedAt;

    // The verdict the tool used to omit entirely: `type` reported success whether or not
    // anything was typed. A provable no-op is now a structured failure, not a summary.
    const typingFailed = typing !== null && typing.landed === false;
    const typingHint = typingFailed
      ? this.typingHint(typing!)
      : typing?.unobservable
        ? 'Keystrokes were delivered, but the control is inside a closed shadow root, so its value cannot be verified from page JS. Confirm the effect through the UI instead of retrying.'
        : undefined;
    const ok = !typingFailed;
    const hints = [(awaited as any)?.hint, typingHint, gateWarning].filter(Boolean).join('; ') || undefined;

    // Record the transition: this is the dataset a runner-side decision model learns from.
    // Never the typed text — only its length, plus whether it landed.
    this.host.recordTransition?.({
      ts: Date.now(),
      action,
      addressMode: hasMark ? 'mark_id' : selector ? 'selector' : hasCoords ? 'coords' : 'none',
      address,
      target: target || undefined,
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
      typed: action === 'type' ? { chars: String(opts.text ?? '').length, secret, landed: typing ? typing.landed : undefined } : undefined,
      typing: typing || undefined,
      clearFirst: action === 'type' ? opts.clearFirst === true : undefined,
    });

    const result: any = {
      ok,
      action,
      markId,
      address,
      target,
      typed: action === 'type' ? shownText : undefined,
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
        message: `Typing had no effect on ${target?.tag ? `<${target.tag}>` : 'the target'} (value length ${typing!.beforeLength} → ${typing!.afterLength}).`,
        hint: typingHint,
      };
    }

    return result;
  }
}
