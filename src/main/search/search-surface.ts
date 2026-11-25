/**
 * The agent-facing web-search surface.
 *
 * Owns the settings-driven engine policy and the cooldown bookkeeping around a
 * `SearchHub` call, so the chassis only wires the dependencies once.
 */
import type { SearchHub, SearchOutcome } from './search-engine.js';
import type { ResearchSettings } from '../research/settings.js';
import type { SurfaceActivityDeps } from '../research/surface-activity.js';

/** The subset of search options the engine policy rewrites. */
export interface SearchPolicyTarget {
  engine?: string;
  engines?: string[];
  urlTemplate?: string;
}

/** Dependencies the search surface needs from the research policy and hub. */
export interface SearchSurfaceDeps extends SurfaceActivityDeps {
  hub: SearchHub;
  settings(): ResearchSettings;
  applyEnginePolicy(effective: SearchPolicyTarget): void;
  isCooling(host: string): boolean;
  markCooldown(host: string, reason: string): void;
  engineHost(engine: string): string;
  error(code: string, message: string): Error & { code: string };
}

/** The agent-facing web-search adapter over SearchHub. */
export class SearchSurface {
  constructor(private readonly deps: SearchSurfaceDeps) {}

  async web(
    query: string,
    opts: { engine?: string; engines?: string[]; urlTemplate?: string; max?: number } = {},
  ): Promise<SearchOutcome> {
    const settings = this.deps.settings();
    const effective = { ...opts };
    if (effective.max === undefined) effective.max = settings.searchMaxResults;
    if (settings.enabled) {
      this.deps.applyEnginePolicy(effective);

      const chain = effective.engines || (effective.engine ? [effective.engine] : []);
      if (chain.length > 0) {
        const allowed = chain.filter((engine) => !this.deps.isCooling(this.deps.engineHost(engine)));
        if (allowed.length === 0) {
          throw this.deps.error(
            'RESEARCH_COOLDOWN',
            'All selected search engines are cooling down after WAF/challenge responses.',
          );
        }
        effective.engines = allowed;
        effective.engine = undefined;
      }
    }

    this.deps.log(
      'action',
      `MCP Directive: search_web("${query}", engine=${effective.engine || (effective.engines ? effective.engines.join('>') : 'auto')}${settings.enabled ? ', stealth' : ''})`,
    );
    return this.deps.activity(
      'search_web',
      query,
      (outcome) =>
        `${outcome.results?.length ?? 0} result(s)${outcome.engine ? ` via ${outcome.engine}` : ''}${outcome.blocked ? ' (provider blocked)' : ''}`,
      async () => {
        const outcome = await this.deps.hub.search(query, effective);
        if (settings.enabled && outcome.blocked) {
          for (const attempt of outcome.attempts) {
            if (attempt.blocked) this.deps.markCooldown(this.deps.engineHost(attempt.engine), 'bot-check/consent');
          }
        }
        return outcome;
      },
    );
  }
}
