/**
 * The readiness model: wait_for (poll until any/all conditions hold) and expect
 * (the same, with a one-shot budget).
 *
 * Why a module: the poll loop, the DOM probe, the host-side conditions and the
 * `stable` tracker are one model. It is the piece `act(await)` also calls.
 */
import { buildWaitProbe, STABILITY_SCRIPT } from './page-scripts.js';
import type { ConditionResult, PrimitivesHost, WaitResult } from './contracts.js';
import type { WaitCondition } from './options.js';

const DOM_WAIT_TYPES = new Set(['selector', 'gone', 'text', 'url', 'role_name', 'find', 'count']);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** When to use: `Primitives` — the wait_for / expect entry points. */
export class WaitController {
  private readonly host: PrimitivesHost;
  private readonly prevStable: Record<string, { value: number; since: number }> = {};

  constructor(host: PrimitivesHost) {
    this.host = host;
  }

  public async waitFor(
    conditions: WaitCondition[],
    opts: { timeoutMs?: number; pollMs?: number; require?: 'any' | 'all' } = {},
  ): Promise<WaitResult> {
    const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 15000;
    const pollMs = opts.pollMs && opts.pollMs > 0 ? opts.pollMs : 120;
    const requireMode: 'any' | 'all' = opts.require === 'all' ? 'all' : 'any';
    const list = (conditions || []).filter(Boolean);
    const started = Date.now();

    if (list.length === 0) {
      return { ok: true, require: requireMode, waitedMs: 0, attempts: 0, results: [] };
    }

    const domConditions = list.filter((c) => DOM_WAIT_TYPES.has(c.type));
    let attempts = 0;
    let results: ConditionResult[] = [];

    for (;;) {
      attempts++;
      const domResults: ConditionResult[] = domConditions.length
        ? await this.host
            .evaluate(buildWaitProbe(domConditions))
            .catch(() => domConditions.map((c) => ({ type: c.type, ok: false, evidence: 'probe error' }) as ConditionResult))
        : [];

      let d = 0;
      let needsStability = false;
      for (const c of list) {
        if (c.type === 'stable') needsStability = true;
      }
      const stability = needsStability ? await this.host.evaluate(STABILITY_SCRIPT).catch(() => ({} as any)) : {};

      results = list.map((c) => {
        if (DOM_WAIT_TYPES.has(c.type)) {
          const r = domResults[d++];
          return { type: c.type, ok: Boolean(r && r.ok), evidence: r?.evidence };
        }
        return this.evalHostCondition(c, stability);
      });

      const ok = requireMode === 'all' ? results.every((r) => r.ok) : results.some((r) => r.ok);
      const elapsed = Date.now() - started;
      if (ok) return { ok: true, require: requireMode, waitedMs: elapsed, attempts, results };
      if (elapsed >= timeoutMs) return { ok: false, require: requireMode, waitedMs: elapsed, attempts, results };
      await sleep(pollMs);
    }
  }

  public async expect(conditions: WaitCondition[]): Promise<WaitResult> {
    return this.waitFor(conditions, { timeoutMs: 1, pollMs: 1, require: 'all' });
  }

  private evalHostCondition(c: WaitCondition, stability: any): ConditionResult {
    if (c.type === 'network_idle') {
      const quietMs = c.quietMs && c.quietMs > 0 ? c.quietMs : 800;
      let idleMs = Number.MAX_SAFE_INTEGER;
      try {
        const recent = this.host.getNetworkTraffic({ limit: 1 });
        if (recent && recent.length) idleMs = Date.now() - (recent[0].requestTime || 0);
      } catch {
        // No traffic buffer: treat as idle.
      }
      const ok = idleMs >= quietMs;
      return { type: c.type, ok, evidence: ok ? `${idleMs}ms idle` : `${idleMs}ms since last request` };
    }
    if (c.type === 'revision') {
      const rev = this.host.revision();
      const want = c.version ?? 0;
      return { type: c.type, ok: rev >= want, evidence: `revision ${rev} (wanted >= ${want})` };
    }
    if (c.type === 'stable') {
      const target = c.target || 'marks';
      const holdMs = c.holdMs && c.holdMs > 0 ? c.holdMs : 400;
      const value =
        target === 'marks'
          ? this.host.getMarks().length
          : target === 'height'
            ? Number(stability?.height || 0)
            : target === 'nodes'
              ? Number(stability?.nodes || 0)
              : Number(stability?.text || 0);
      const now = Date.now();
      const prev = this.prevStable[target];
      if (!prev || prev.value !== value) {
        this.prevStable[target] = { value, since: now };
        return { type: c.type, ok: false, evidence: `${target}=${value} (changed)` };
      }
      const heldFor = now - prev.since;
      return { type: c.type, ok: heldFor >= holdMs, evidence: `${target}=${value} held ${heldFor}ms` };
    }
    return { type: c.type, ok: false, evidence: 'unsupported host condition' };
  }
}
