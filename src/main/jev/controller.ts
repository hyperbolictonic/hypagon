/**
 * The JEV (Just-Enough-View) gate: page-read funneling, the depth store and
 * its on-demand index.
 *
 * Why a module: the chassis carried six JEV fields and nine methods that only
 * talked to each other — the policy gate, the funnel decision, the loop
 * breaker, the stats counters and the depth store. They are one policy; they
 * belong in one object. The chassis keeps thin delegations so its public
 * surface is unchanged.
 *
 * The funnels (precheck, guard) refuse unscoped page reads while enforce mode
 * is on; the loop breaker releases a page refused twice in 60s so agents never
 * dead-loop, and every release is counted.
 */
import type { HarvestedConstruct } from '../../shared/types.js';
import { JevEngine, type JevStatus } from './engine.js';
import { decideFunnel, FunnelBreaker } from './policy.js';
import type {
  GuardPageReadInput,
  GuardPageReadResult,
  PageReadRequest,
  PrecheckPageReadResult,
} from './read-contract.js';

/** When to use: building the chassis — the collaborators JEV reads through. */
export interface JevControllerDeps {
  /** The availability/enforce switch wired from the settings store. */
  policy: () => { available: boolean; enforce: boolean };
  /** The active page's url and title, used for staleness checks and index metadata. */
  pageInfo: () => { url: string; title: string };
  /** Quiet DOM evaluation, for the pre-harvest text-length estimate. */
  evaluate: (script: string) => Promise<any>;
  /** Full markdown harvest, for building the index on a page change. */
  harvest: () => Promise<HarvestedConstruct>;
}

/** When to use: declaring the optional JEV gate; wired by index.ts to the settings store + decision status. */
export interface JevPolicy {
  available: boolean;
  enforce: boolean;
}

const CYCLE_NOTE =
  'JEV funnel bypassed: this page was refused twice in 60s, so the read was served. Prefer jev_index next time.';

/** The `next` array every refusal carries: index first, then section 1. */
const refusalNext = [
  { tool: 'jev_index' },
  { tool: 'read_section', arguments: { section_id: 'sec_1' } },
];

/** The override hint every refusal carries. */
const refusalOverride = { parameter: 'full', value: true, note: 'bypasses the funnel and is logged' };

/** When to use: the chassis — own the JEV gate, funnel, loop breaker, stats and depth store. */
export class JevController {
  private readonly deps: JevControllerDeps;
  private readonly engine = new JevEngine();
  private readonly breaker = new FunnelBreaker();
  private stats = { blocked: 0, precheck: 0, bypassed: 0, loopBreaker: 0, blockedTokens: 0 };

  constructor(deps: JevControllerDeps) {
    this.deps = deps;
  }

  /** When to use: startup — point the controller at the live settings. */
  setPolicyProvider(policy: () => JevPolicy): void {
    this.policy = policy;
  }

  private policy: () => JevPolicy = () => ({ available: false, enforce: false });

  getPolicy(): JevPolicy {
    try {
      const policy = this.policy();
      const available = policy?.available === true;
      return { available, enforce: available && policy?.enforce === true };
    } catch {
      return { available: false, enforce: false };
    }
  }

  isEnabled(): boolean {
    return this.getPolicy().available;
  }

  isEnforced(): boolean {
    return this.getPolicy().enforce;
  }

  getStats(): {
    blocked: number;
    precheck: number;
    bypassed: number;
    loopBreaker: number;
    blockedTokens: number;
    breaker: Array<{ url: string; refusals: number; firstAt: number }>;
  } {
    return { ...this.stats, breaker: this.breaker.snapshot() };
  }

  getStatus(): JevStatus {
    const policy = this.getPolicy();
    return {
      ...this.engine.status(policy.available),
      mode: policy.enforce ? 'enforce' : 'prefer',
      enforced: policy.enforce,
    };
  }

  /** The depth store no longer matches the active page — drop it. */
  purge(): void {
    this.engine.purge();
  }

  /**
   * Cheap pre-harvest refusal: measure the DOM text length before paying for a
   * full harvest. The post-harvest guard stays authoritative (inline marks and
   * URLs can push real markdown over the threshold), so this is a latency
   * optimization, not a second policy.
   */
  async precheckPageRead(input: PageReadRequest): Promise<PrecheckPageReadResult> {
    if (!this.getPolicy().enforce) return { blocked: false };
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

    const url = this.deps.pageInfo().url || '';
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
  guardPageRead(input: GuardPageReadInput): GuardPageReadResult {
    const policy = this.getPolicy();
    const url = input.url || this.deps.pageInfo().url || '';
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

    let sections = 0;
    try {
      if (input.content) {
        if (this.engine.current?.url !== url) {
          const session = this.engine.build(input.content, url, input.title || '');
          sections = session.order.length;
        } else {
          sections = this.engine.current.order.length;
        }
      }
    } catch {
      // The refusal still stands; jev_index will report the build error.
    }
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

  /** Build (or refresh) the JEV surface index for the active page. */
  async index(): Promise<{ ok: boolean; error?: string; index?: string; status?: JevStatus }> {
    if (!this.isEnabled()) {
      return { ok: false, error: 'JEV is disabled. Enable it in Settings → Decision Model (it requires a configured decision model).' };
    }
    try {
      const info = this.deps.pageInfo();
      const current = this.engine.current;
      if (!current || current.url !== info.url) {
        const construct = await this.deps.harvest();
        this.engine.build(construct.content || '', construct.url || info.url, construct.title || info.title || '');
      }
      return { ok: true, index: this.engine.renderIndex(), status: this.getStatus() };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  /**
   * The JEV precondition shared by read and search: the feature must be on,
   * and the folded depth store must not be from a page other than the active
   * one. Returns the standard refusal when disabled; otherwise purges and
   * returns undefined so the caller proceeds.
   */
  private requireFresh(): { ok: false; error: string } | undefined {
    if (!this.isEnabled()) {
      return { ok: false, error: 'JEV is disabled. Enable it in Settings → Decision Model.' };
    }
    if (this.engine.current && this.deps.pageInfo().url !== this.engine.current.url) this.engine.purge();
    return undefined;
  }

  /** Fetch one section body from the depth store on demand. */
  readSection(
    sectionId: string,
    includeChildren = false,
  ): { ok: boolean; section_id?: string; tokens?: number; content?: string; folded?: string[]; error?: string } {
    const blocked = this.requireFresh();
    if (blocked) return blocked;
    return this.engine.readSection(sectionId, includeChildren);
  }

  /** Keyword/regex query over the folded depth store. */
  search(query: string): {
    ok: boolean;
    hits?: Array<{ section_id: string; heading: string; matches: number; snippet: string }>;
    error?: string;
  } {
    const blocked = this.requireFresh();
    if (blocked) return blocked;
    return this.engine.search(query);
  }
}
