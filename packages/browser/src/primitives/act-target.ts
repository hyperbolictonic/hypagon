/**
 * Act's window onto the page: where a locator is, what control sits under it, and
 * the cheap identity an action is judged against.
 *
 * Why a module: `act` needs three reads that are not about intent — the box a
 * locator resolves to (failing loudly on a 0x0 viewport), the typed facts of the
 * control under it, and the url/revision/mark snapshot taken before and after.
 */
import { fieldFactsScript, targetBoxScript, type TargetBox, type TargetLocator } from './dom-targeting.ts';
import { PrimitiveError, type FieldFacts, type PrimitivesHost } from './contracts.ts';

/** When to use: act's delta — the cheap identity of the page at one moment. */
export interface ActSnapshot {
  revision: number;
  url: string;
  title: string;
  marks: number;
}

/** When to use: act — one cheap read of the identity it reports a delta against. */
export function actSnapshot(host: PrimitivesHost): ActSnapshot {
  const info = host.getPageInfo();
  return { revision: host.revision(), url: info.url, title: info.title, marks: host.getMarks().length };
}

/** When to use: `ActController` — resolving a locator to page geometry and facts. */
export class ActTarget {
  private readonly host: PrimitivesHost;

  constructor(host: PrimitivesHost) {
    this.host = host;
  }

  /**
   * Resolve a locator to the box of the control to act on, scrolling it into view.
   * Shadow-aware: a selector naming a custom-element host resolves to the inner control
   * a mouse would hit (see dom-targeting.ts).
   */
  async box(locator: TargetLocator): Promise<TargetBox | null> {
    const res = (await this.host.evaluate(targetBoxScript(locator)).catch(() => null)) as TargetBox | null;
    if (!res || typeof res.x !== 'number' || typeof res.y !== 'number') return null;
    // A tab that has never been laid out reports a 0x0 viewport and geometry that has
    // nothing to do with the page (this produced a silent click at (31, 0) on a fixture
    // whose button was at (231, 90)). Fail loudly instead of acting on nonsense.
    if (res.vw === 0 || res.vh === 0) {
      throw new PrimitiveError(
        'NO_TARGET',
        'The page viewport is 0x0, so no target can be resolved — the tab has not been laid out yet (the window may be hidden or minimised). Make the window visible and retry.',
        { selector: locator.selector },
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
  async field(locator: TargetLocator): Promise<FieldFacts | null> {
    const facts = await this.host.evaluate(fieldFactsScript(locator)).catch(() => null);
    return facts && typeof facts.tag === 'string' ? (facts as FieldFacts) : null;
  }
}
