/**
 * The JEV (Just-Enough-View) gate: page-read funneling, the depth store and
 * its on-demand index.
 *
 * Why this file is small: the policy switch is `policy-gate.ts`, the two funnels
 * with their loop breaker and counters are `funnel.ts`, and the depth store with
 * its reads is `depth-store.ts`. This class is the composition the chassis
 * holds — policy in, decisions out.
 *
 * The funnels (precheck, guard) refuse unscoped page reads while enforce mode
 * is on; the loop breaker releases a page refused twice in 60s so agents never
 * dead-loop, and every release is counted.
 */
import type { HarvestedConstruct } from '../../shared/types.js';
import type { GuardPageReadInput, GuardPageReadResult, PageReadRequest, PrecheckPageReadResult } from './read-contract.js';
import type { JevStatus } from './engine.js';
import { JevPolicyGate, type JevPolicy } from './policy-gate.js';
import { JevFunnel } from './funnel.js';
import { JevDepthStore } from './depth-store.js';

export type { JevPolicy } from './policy-gate.js';

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

/** When to use: the chassis — own the JEV gate, funnel, store and counters. */
export class JevController {
  /** The availability/enforce switch (wired by the boot). */
  readonly policy = new JevPolicyGate();
  /** The folded depth store behind jev_index / read_section. */
  readonly store: JevDepthStore;
  /** The precheck and guard funnels with their loop breaker. */
  readonly funnel: JevFunnel;

  constructor(deps: JevControllerDeps) {
    this.store = new JevDepthStore({
      policy: () => this.policy.get(),
      pageInfo: deps.pageInfo,
      harvest: deps.harvest,
    });
    this.funnel = new JevFunnel({
      policy: () => this.policy.get(),
      pageUrl: () => deps.pageInfo().url,
      evaluate: deps.evaluate,
      sectionCount: (url, content, title) => this.store.sectionsFor(url, content, title),
    });
  }

  /** When to use: startup — point the controller at the live settings. */
  setPolicyProvider(policy: () => JevPolicy): void {
    this.policy.set(policy);
  }

  getPolicy(): JevPolicy {
    return this.policy.get();
  }

  isEnabled(): boolean {
    return this.policy.enabled();
  }

  isEnforced(): boolean {
    return this.policy.enforced();
  }

  getStatus(): JevStatus {
    return this.store.status();
  }

  /** The depth store no longer matches the active page — drop it. */
  purge(): void {
    this.store.purge();
  }

  /** Cheap pre-harvest refusal; the post-harvest guard stays authoritative. */
  async precheckPageRead(input: PageReadRequest): Promise<PrecheckPageReadResult> {
    return this.funnel.precheck(input);
  }

  /** Hard-funnel guard for unscoped page reads, called before a projection leaves the process. */
  guardPageRead(input: GuardPageReadInput): GuardPageReadResult {
    return this.funnel.guard(input);
  }
}
