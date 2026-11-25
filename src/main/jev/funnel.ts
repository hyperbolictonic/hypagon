/**
 * The JEV funnels (precheck and guard), the loop breaker and the counters.
 *
 * Why a module: refusing an unscoped page read is one policy with two entry
 * points — a cheap pre-harvest estimate and the authoritative post-harvest
 * guard. They share the breaker, the stats and the refusal payload, so they live
 * together and the controller only decides what to do with the answer.
 */
import { decideFunnel, FunnelBreaker } from './policy.js';
import type {
  GuardPageReadInput,
  GuardPageReadResult,
  PageReadRequest,
  PrecheckPageReadResult,
} from './read-contract.js';
import type { JevPolicy } from './policy-gate.js';

const CYCLE_NOTE =
  'JEV funnel bypassed: this page was refused twice in 60s, so the read was served. Prefer jev_index next time.';

/** The `next` array every refusal carries: index first, then section 1. */
const refusalNext = [{ tool: 'jev_index' }, { tool: 'read_section', arguments: { section_id: 'sec_1' } }];

/** The override hint every refusal carries. */
const refusalOverride = { parameter: 'full', value: true, note: 'bypasses the funnel and is logged' };

/** When to use: constructing the controller — the policy, the page and the section count. */
export interface JevFunnelDeps {
  policy: () => JevPolicy;
  pageUrl: () => string;
  evaluate: (script: string) => Promise<any>;
  /** How many sections the refusal should promise (`0` when there is no content). */
  sectionCount: (url: string, content: string | undefined, title: string | undefined) => number;
}

/** When to use: `JevController` — own both funnels, the loop breaker and the counters. */
export class JevFunnel {
  private readonly breaker = new FunnelBreaker();
  private stats = { blocked: 0, precheck: 0, bypassed: 0, loopBreaker: 0, blockedTokens: 0 };

  constructor(private readonly deps: JevFunnelDeps) {}

  /** The counters plus the breaker's current release window. */
  snapshot(): {
    blocked: number;
    precheck: number;
    bypassed: number;
    loopBreaker: number;
    blockedTokens: number;
    breaker: Array<{ url: string; refusals: number; firstAt: number }>;
  } {
    return { ...this.stats, breaker: this.breaker.snapshot() };
  }

  /**
   * Cheap pre-harvest refusal: measure the DOM text length before paying for a
   * full harvest. The post-harvest guard stays authoritative (inline marks and
   * URLs can push real markdown over the threshold), so this is a latency
   * optimization, not a second policy.
   */
  async precheck(input: PageReadRequest): Promise<PrecheckPageReadResult> {
    if (!this.deps.policy().enforce) return { blocked: false };
    if (input.as !== 'markdown' && input.as !== 'text') return { blocked: false };
    if (input.full === true) return { blocked: false };
    if (input.region !== undefined && input.region !== null) return { blocked: false };
    if (input.cursor !== undefined && input.cursor !== null && input.cursor !== '') return { blocked: false };
    if (typeof input.budget === 'number' && Number.isFinite(input.budget) && input.budget > 0) return { blocked: false };

    let chars = 0;
    try {
      // textContent, not innerText: no layout pass, and close enough to size the page.
      const raw = await this.deps.evaluate(
        "(() => { const b = document.body; return b ? (b.textContent || '').length : 0; })()",
      );
      chars = Number(raw) || 0;
    } catch {
      // Unknown size: fall through to the harvest guard rather than guessing.
      return { blocked: false };
    }
    const tokens = Math.ceil(chars / 4);
    const decision = decideFunnel({ enforce: true, as: input.as, pageTokens: tokens });
    if (decision.allowed) return { blocked: false };

    const url = this.deps.pageUrl() || '';
    if (this.breaker.shouldRelease(url)) {
      this.breaker.reset(url);
      this.stats.bypassed += 1;
      this.stats.loopBreaker += 1;
      return { blocked: false, note: CYCLE_NOTE };
    }
    this.breaker.recordRefusal(url);
    this.stats.blocked += 1;
    this.stats.precheck += 1;
    this.stats.blockedTokens += tokens;
    return {
      blocked: true,
      refusal: {
        page: { url, tokens, estimated: true },
        next: refusalNext,
        override: refusalOverride,
      },
    };
  }

  /**
   * Hard-funnel guard for unscoped page reads. Called by the primitives before
   * a markdown/text projection leaves the process. Returns a refusal payload
   * that names the next call, or a `note` when the loop breaker released the
   * read.
   */
  guard(input: GuardPageReadInput): GuardPageReadResult {
    const policy = this.deps.policy();
    const url = input.url || this.deps.pageUrl() || '';
    const decision = decideFunnel({
      enforce: policy.enforce,
      as: input.as,
      region: input.region,
      budget: input.budget,
      cursor: input.cursor,
      full: input.full,
      pageTokens: input.pageTokens,
    });
    if (decision.allowed) {
      if (decision.reason === 'override') this.stats.bypassed += 1;
      return { allowed: true, reason: decision.reason };
    }
    if (this.breaker.shouldRelease(url)) {
      this.breaker.reset(url);
      this.stats.bypassed += 1;
      this.stats.loopBreaker += 1;
      return { allowed: true, reason: 'loop-breaker', note: CYCLE_NOTE };
    }
    this.breaker.recordRefusal(url);
    this.stats.blocked += 1;
    this.stats.blockedTokens += Math.max(0, Number(input.pageTokens) || 0);

    const sections = this.deps.sectionCount(url, input.content, input.title);
    return {
      allowed: false,
      reason: 'unscoped',
      refusal: {
        page: { url, tokens: input.pageTokens, sections },
        next: refusalNext,
        override: refusalOverride,
      },
    };
  }
}
