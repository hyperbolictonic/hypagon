/**
 * Resolving an act address: mark id, visible text, CSS selector, coordinates or a
 * sealed token — into a label, a live viewport centre and the control's facts.
 *
 * Why a module: the five addressing modes each have their own failure and their own
 * refresh rule, and together they were the largest block inside `act`. One class
 * keeps the precedence (mark > text > selector > coords > sealed) in one place.
 */
import { parseTextTargets, textTargetExpression } from './text-target.ts';
import { PrimitiveError, type ActOptions, type FieldFacts, type PrimitivesHost } from './contracts.ts';
import { ActTarget } from './act-target.ts';

/** The addressing decision `act` makes once, before it touches the page. */
export interface ActPlan {
  action: 'click' | 'type' | 'hover' | 'press' | 'focus';
  hasMark: boolean;
  markId?: number;
  selector?: string;
  hasCoords: boolean;
  hasText: boolean;
  hasSealedToken: boolean;
  px?: number;
  py?: number;
  targetText?: string;
  sealedToken?: string;
  secret: boolean;
  shownText: string;
  logLine: string;
}

/** What resolving the address produced: the label, the centre and the control facts. */
export interface ResolvedAddress {
  center: { x: number; y: number } | null;
  address: string;
  target: {
    id?: number;
    tag?: string;
    text?: string;
    selector?: string;
    center?: { x: number; y: number };
    field?: FieldFacts;
  } | null;
}

/** When to use: `ActController` — resolve whichever address the caller gave. */
export class ActAddressResolver {
  private readonly host: PrimitivesHost;
  private readonly target: ActTarget;

  constructor(host: PrimitivesHost) {
    this.host = host;
    this.target = new ActTarget(host);
  }

  /**
   * Resolve the address to a human label plus, where one is needed, a live viewport
   * centre (hover, coordinate clicks, and the focus-click that precedes a coordinate type).
   */
  async resolve(opts: ActOptions, plan: ActPlan): Promise<ResolvedAddress> {
    const resolved: ResolvedAddress = { center: null, address: '', target: null };
    if (plan.action === 'press') return resolved;
    if (plan.hasMark) return this.byMark(plan, opts);
    if (plan.hasText) return this.byText(opts, plan);
    if (plan.selector) return this.bySelector(plan);
    if (plan.hasCoords) return this.byPoint(plan);
    return this.bySealedToken(plan);
  }

  private async byMark(plan: ActPlan, opts: ActOptions): Promise<ResolvedAddress> {
    let hit = await this.host.getMarkTarget(plan.markId!);
    if (!hit && opts.includeOffscreen !== false) {
      // Mark registry may be cold (fresh tab / no scan yet) — refresh once.
      await this.host.injectMarks({ includeOffscreen: true });
      hit = await this.host.getMarkTarget(plan.markId!);
    }
    if (!hit) {
      throw new PrimitiveError('STALE_REF', `Mark #${plan.markId} could not be resolved. Re-run observe/find to refresh refs.`, {
        markId: plan.markId,
      });
    }
    const center = hit.currentCenter;
    const target: ResolvedAddress['target'] = {
      id: hit.mark.id,
      tag: hit.mark.tag,
      text: plan.secret ? '[REDACTED]' : hit.mark.text,
      center,
    };
    const field = await this.target.field({ markId: plan.markId! });
    if (field) target!.field = field;
    return { center, address: `#${plan.markId}`, target };
  }

  private async byText(opts: ActOptions, plan: ActPlan): Promise<ResolvedAddress> {
    const rawTargets = await this.host
      .evaluate(textTargetExpression(plan.targetText!, { exact: opts.targetExact === true, max: 8 }))
      .catch(() => null);
    const found = parseTextTargets(rawTargets);
    if (!found.matches.length) {
      throw new PrimitiveError('NO_TARGET', `No visible element contains "${plan.targetText}"`, { targetText: plan.targetText });
    }
    if (found.matches.length > 1) {
      throw new PrimitiveError(
        'AMBIGUOUS',
        `"${plan.targetText}" matches ${found.matches.length} elements — pass a longer string or a mark id`,
        { targetText: plan.targetText, candidates: found.matches.slice(0, 5) },
      );
    }
    const match = found.matches[0];
    const center = { x: match.x, y: match.y };
    const target: ResolvedAddress['target'] = { tag: match.tag, text: match.text, center };
    const field = await this.target.field({ point: center });
    if (field) target!.field = field;
    return { center, address: `text "${match.text}"`, target };
  }

  private async bySelector(plan: ActPlan): Promise<ResolvedAddress> {
    const box = await this.target.box({ selector: plan.selector! });
    if (!box) {
      throw new PrimitiveError('NO_TARGET', `Selector "${plan.selector}" matched no visible element`, { selector: plan.selector });
    }
    const center = { x: box.x, y: box.y };
    const target: ResolvedAddress['target'] = { selector: plan.selector, tag: box.tag, text: box.text, center };
    const field = await this.target.field({ selector: plan.selector! });
    if (field) target!.field = field;
    return { center, address: plan.selector!, target };
  }

  private async byPoint(plan: ActPlan): Promise<ResolvedAddress> {
    const center = { x: plan.px!, y: plan.py! };
    const target: ResolvedAddress['target'] = { center };
    const field = await this.target.field({ point: center });
    if (field) target!.field = field;
    return { center, address: `(${plan.px}, ${plan.py})`, target };
  }

  private async bySealedToken(plan: ActPlan): Promise<ResolvedAddress> {
    if (!this.host.resolveSealedToken) {
      throw new PrimitiveError('NOT_SUPPORTED', 'Sealed tokens are not available in this build.');
    }
    const sealed = await this.host.resolveSealedToken(plan.sealedToken!);
    if (!sealed) {
      throw new PrimitiveError('STALE_REF', 'The sealed target expired or the frame navigated. Re-run find(sealed:true).');
    }
    const center = sealed.center;
    const target: ResolvedAddress['target'] = { text: 'sealed control', center };
    const field = await this.target.field({ point: center });
    if (field) target!.field = field;
    return { center, address: `sealed ${plan.sealedToken!.slice(0, 10)}`, target };
  }
}
