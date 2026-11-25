/**
 * The JEV depth store: the folded index for the active page plus the section
 * read and search over it.
 *
 * Why a module: building the index, reading one section and searching are one
 * job over `JevEngine`, and all three guard on "enabled and still on this page".
 * The controller only composes them with the policy and the funnels.
 */
import type { HarvestedConstruct } from '../../shared/types.js';
import { JevEngine, type JevStatus } from './engine.js';
import type { JevPolicy } from './policy-gate.js';

/** When to use: constructing the controller — the policy and the page lookups. */
export interface JevDepthStoreDeps {
  policy: () => JevPolicy;
  pageInfo: () => { url: string; title: string };
  harvest: () => Promise<HarvestedConstruct>;
}

/** When to use: `JevController` — own the depth store and the reads over it. */
export class JevDepthStore {
  private readonly engine = new JevEngine();

  constructor(private readonly deps: JevDepthStoreDeps) {}

  /** The store status, with the policy's mode folded in. */
  status(): JevStatus {
    const policy = this.deps.policy();
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

  /** How many sections a refusal should promise for this content (0 when unknown). */
  sectionsFor(url: string, content: string | undefined, title: string | undefined): number {
    if (!content) return 0;
    try {
      if (this.engine.current?.url !== url) {
        return this.engine.build(content, url, title || '').order.length;
      }
      return this.engine.current.order.length;
    } catch {
      // The refusal still stands; jev_index will report the build error.
      return 0;
    }
  }

  /** Build (or refresh) the JEV surface index for the active page. */
  async index(): Promise<{ ok: boolean; error?: string; index?: string; status?: JevStatus }> {
    if (!this.deps.policy().available) {
      return { ok: false, error: 'JEV is disabled. Enable it in Settings → Decision Model (it requires a configured decision model).' };
    }
    try {
      const info = this.deps.pageInfo();
      const current = this.engine.current;
      if (!current || current.url !== info.url) {
        const construct = await this.deps.harvest();
        this.engine.build(construct.content || '', construct.url || info.url, construct.title || info.title || '');
      }
      return { ok: true, index: this.engine.renderIndex(), status: this.status() };
    } catch (error: any) {
      return { ok: false, error: error?.message || String(error) };
    }
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

  /**
   * The JEV precondition shared by read and search: the feature must be on,
   * and the folded depth store must not be from a page other than the active
   * one. Returns the standard refusal when disabled; otherwise purges and
   * returns undefined so the caller proceeds.
   */
  private requireFresh(): { ok: false; error: string } | undefined {
    if (!this.deps.policy().available) {
      return { ok: false, error: 'JEV is disabled. Enable it in Settings → Decision Model.' };
    }
    if (this.engine.current && this.deps.pageInfo().url !== this.engine.current.url) this.engine.purge();
    return undefined;
  }
}
