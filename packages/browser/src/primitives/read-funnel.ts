/**
 * The JEV hard funnel over page reads: the cheap precheck, the authoritative guard,
 * and the one refusal both raise.
 *
 * Why a module: observe (text and markdown) is the only caller, but the three
 * pieces are a policy of their own — they decide whether a read is served at all,
 * and the refusal text tells the agent which call to make instead.
 */
import { PrimitiveError, type ObserveOptions, type PrimitivesHost, type PrecheckPageReadResult } from './contracts.ts';

/** When to use: `ObserveController` — the read policy for unscoped page dumps. */
export class PageReadFunnel {
  private readonly host: PrimitivesHost;

  constructor(host: PrimitivesHost) {
    this.host = host;
  }

  /** The cheap pre-harvest check shared by the text and markdown reads. */
  async precheck(as: 'text' | 'markdown', opts: ObserveOptions): Promise<PrecheckPageReadResult | undefined> {
    const pre = await this.host.precheckPageRead?.({
      as,
      region: opts.region,
      budget: opts.budget,
      cursor: opts.cursor,
      full: opts.full,
    });
    if (pre?.blocked) this.refuse(pre.refusal);
    return pre;
  }

  /**
   * The authoritative guard, called before a projection leaves the process. Returns a
   * note when the loop breaker released the read, so the caller can surface it.
   */
  check(
    as: string,
    info: { url: string; title: string },
    text: string,
    opts: ObserveOptions,
    content?: string,
  ): string | undefined {
    if (!this.host.guardPageRead) return undefined;
    const guard = this.host.guardPageRead({
      as,
      region: opts.region,
      budget: opts.budget,
      cursor: opts.cursor,
      full: opts.full,
      pageTokens: Math.ceil((text || '').length / 4),
      url: info.url,
      title: info.title,
      content: content ?? text,
    });
    if (!guard.allowed) this.refuse(guard.refusal);
    return guard.note;
  }

  /** The one JEV refusal every read path raises. */
  private refuse(detail?: Record<string, any>): never {
    throw new PrimitiveError(
      'JEV_REQUIRED',
      'Unscoped page reads are disabled while JEV enforce is on. Call jev_index, then read_section for the sections you need.',
      detail,
    );
  }
}
