/**
 * The JEV (just-enough-view) surface: policy, the page-read funnel, the index and section reads.
 *
 * Extracted from `BrowserChassis` so the index/funnel logic has one home; the chassis exposes it
 * as `chassis.jevSurface`.
 */
import type { WebContents } from 'electron';
import type { JevStatus } from '../jev/engine.js';
import { decideFunnel } from '../jev/policy.js';
import type { PageReadGuardInput, PageReadPrecheckInput } from '../primitives/primitives.js';

/** When to use: constructing the JEV surface from the chassis' own services. */
export interface JevSurfaceDeps {
  jev: any;
  jevStats: { blocked: number; precheck: number; bypassed: number; loopBreaker: number; blockedTokens: number };
  jevBreaker: any;
  jevPolicyGate: () => { available: boolean; enforce: boolean };
  sidebarOverlayVisible: boolean;
  sidebarMode: string;
  getPageInfo: () => any;
  evaluateQuiet: (script: string) => Promise<any>;
  harvestMarkdown: (opts?: any) => Promise<any>;
}

/** When to use: `chassis.jevSurface` — the JEV policy and page-read funnel. */
export class JevSurface {
  constructor(private readonly deps: JevSurfaceDeps) {}

  public setJevPolicyProvider(policy: () => { available: boolean; enforce: boolean }): void {
    this.deps.jevPolicyGate = policy;
  }

  public getJevPolicy(): { available: boolean; enforce: boolean } {
    try {
      const policy = this.deps.jevPolicyGate();
      const available = policy?.available === true;
      return { available, enforce: available && policy?.enforce === true };
    } catch {
      return { available: false, enforce: false };
    }
  }

  public isJevEnabled(): boolean {
    return this.getJevPolicy().available;
  }

  public isJevEnforced(): boolean {
    return this.getJevPolicy().enforce;
  }

  public getJevStats(): { blocked: number; precheck: number; bypassed: number; loopBreaker: number; blockedTokens: number; breaker: Array<{ url: string; refusals: number; firstAt: number }> } {
    return { ...this.deps.jevStats, breaker: this.deps.jevBreaker.snapshot() };
  }

  public getJevStatus(): JevStatus {
    const policy = this.getJevPolicy();
    return {
      ...this.deps.jev.status(policy.available),
      mode: policy.enforce ? 'enforce' : 'prefer',
      enforced: policy.enforce,
    };
  }

  /**
   * Cheap pre-harvest refusal: measure the DOM text length before paying for a
   * full harvest. The post-harvest guard stays authoritative (inline marks and
   * URLs can push real markdown over the threshold), so this is a latency
   * optimization, not a second policy.
   */
  public async precheckJevPageRead(input: PageReadPrecheckInput): Promise<{ blocked: boolean; note?: string; refusal?: Record<string, any> }> {
    const policy = this.getJevPolicy();
    if (!policy.enforce) return { blocked: false };
    if (input.as !== 'markdown' && input.as !== 'text') return { blocked: false };
    if (input.full === true) return { blocked: false };
    if (input.region !== undefined && input.region !== null) return { blocked: false };
    if (input.cursor !== undefined && input.cursor !== null && input.cursor !== '') return { blocked: false };
    if (typeof input.budget === 'number' && Number.isFinite(input.budget) && input.budget > 0) return { blocked: false };

    const info = this.deps.getPageInfo();
    let chars = 0;
    try {
      // textContent, not innerText: no layout pass, and close enough to size the page.
      const raw = await this.deps.evaluateQuiet(
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

    const url = info.url || '';
    if (this.deps.jevBreaker.shouldRelease(url)) {
      this.deps.jevBreaker.reset(url);
      this.deps.jevStats.bypassed += 1;
      this.deps.jevStats.loopBreaker += 1;
      return {
        blocked: false,
        note: 'JEV funnel bypassed: this page was refused twice in 60s, so the read was served. Prefer jev_index next time.',
      };
    }
    this.deps.jevBreaker.recordRefusal(url);
    this.deps.jevStats.blocked += 1;
    this.deps.jevStats.precheck += 1;
    this.deps.jevStats.blockedTokens += tokens;
    return {
      blocked: true,
      refusal: {
        page: { url, tokens, estimated: true },
        next: [
          { tool: 'jev_index' },
          { tool: 'read_section', arguments: { section_id: 'sec_1' } },
        ],
        override: { parameter: 'full', value: true, note: 'bypasses the funnel and is logged' },
      },
    };
  }

  /**
   * Hard-funnel guard for unscoped page reads. Called by the primitives before a
   * markdown/text projection leaves the process. Returns a refusal payload that
   * names the next call, or a `note` when the loop breaker released the read.
   */
  public guardJevPageRead(input: PageReadGuardInput): {
    allowed: boolean;
    reason: string;
    note?: string;
    refusal?: {
      page: { url: string; tokens: number; sections: number };
      next: Array<Record<string, any>>;
      override: Record<string, any>;
    };
  } {
    const policy = this.getJevPolicy();
    const url = input.url || this.deps.getPageInfo().url || '';
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
      if (decision.reason === 'override') this.deps.jevStats.bypassed += 1;
      return { allowed: true, reason: decision.reason };
    }
    if (this.deps.jevBreaker.shouldRelease(url)) {
      this.deps.jevBreaker.reset(url);
      this.deps.jevStats.bypassed += 1;
      this.deps.jevStats.loopBreaker += 1;
      return {
        allowed: true,
        reason: 'loop-breaker',
        note: 'JEV funnel bypassed: this page was refused twice in 60s, so the read was served. Prefer jev_index next time.',
      };
    }
    this.deps.jevBreaker.recordRefusal(url);
    this.deps.jevStats.blocked += 1;
    this.deps.jevStats.blockedTokens += Math.max(0, Number(input.pageTokens) || 0);

    let sections = 0;
    try {
      if (input.content) {
        if (this.deps.jev.current?.url !== url) {
          const session = this.deps.jev.build(input.content, url, input.title || '');
          sections = session.order.length;
        } else {
          sections = this.deps.jev.current.order.length;
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
        next: [
          { tool: 'jev_index' },
          { tool: 'read_section', arguments: { section_id: 'sec_1' } },
        ],
        override: { parameter: 'full', value: true, note: 'bypasses the funnel and is logged' },
      },
    };
  }

  /** Build (or refresh) the JEV surface index for the active page. */
  public async jevIndex(): Promise<{ ok: boolean; error?: string; index?: string; status?: JevStatus }> {
    if (!this.isJevEnabled()) {
      return { ok: false, error: 'JEV is disabled. Enable it in Settings → Decision Model (it requires a configured decision model).' };
    }
    try {
      const info = this.deps.getPageInfo();
      const current = this.deps.jev.current;
      if (!current || current.url !== info.url) {
        const construct = await this.deps.harvestMarkdown();
        this.deps.jev.build(construct.content || '', construct.url || info.url, construct.title || info.title || '');
      }
      return { ok: true, index: this.deps.jev.renderIndex(), status: this.getJevStatus() };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
  }

  /** Fetch one section body from the depth store on demand. */
  public jevReadSection(
    sectionId: string,
    includeChildren = false,
  ): { ok: boolean; section_id?: string; tokens?: number; content?: string; folded?: string[]; error?: string } {
    if (!this.isJevEnabled()) {
      return { ok: false, error: 'JEV is disabled. Enable it in Settings → Decision Model.' };
    }
    if (this.deps.jev.current && this.deps.getPageInfo().url !== this.deps.jev.current.url) this.deps.jev.purge();
    return this.deps.jev.readSection(sectionId, includeChildren);
  }

  /** Keyword/regex query over the folded depth store. */
  public jevSearch(query: string): { ok: boolean; hits?: Array<{ section_id: string; heading: string; matches: number; snippet: string }>; error?: string } {
    if (!this.isJevEnabled()) {
      return { ok: false, error: 'JEV is disabled. Enable it in Settings → Decision Model.' };
    }
    if (this.deps.jev.current && this.deps.getPageInfo().url !== this.deps.jev.current.url) this.deps.jev.purge();
    return this.deps.jev.search(query);
  }
}
