/**
 * Crawl and research-run surface.
 *
 * Owns the crawler, the topic researcher and the crawl orchestrator: the
 * render-with-escalation pipeline, the BFS crawl, the topic run, the research
 * activity feed and the cheap static fetch tier. The chassis supplies the
 * research LLM, the search hub, the citation controller, the detached view and
 * the cooldown policy, each behind an explicit dependency.
 */
import { randomUUID } from 'node:crypto';
import type { LlmSurface } from '../llm/llm-surface.js';
import type { SearchOutcome } from '../search/search-engine.js';
import { Crawler, type CrawlOptions, type CrawlOutcome } from '../crawl/crawler.js';
import { fetchStatic } from '../network/impersonate.js';
import type { ConstructHarvester } from '../harvester/markdown.js';
import type { CitationAnchor } from './anchors.js';
import type { CitationController } from './citation-controller.js';
import { CrawlOrchestrator, type CrawlSessionPolicy, type RenderCrawlOptions, type RenderCrawlResult } from './crawl-orchestrator.js';
import type { DetachedViewController } from './detached-view.js';
import { Researcher, type ResearchOptions, type ResearchOutcome } from './researcher.js';
import type { ResearchSettings } from './settings.js';

/** Dependencies the crawl surface needs from the research session and page stores. */
export interface CrawlSurfaceDeps {
  /** The research-session LLM adapter (content negotiation + Markdown fetch). */
  researchLlm(): LlmSurface;
  search(query: string, opts: { engine?: string; engines?: string[]; urlTemplate?: string; max?: number }): Promise<SearchOutcome>;
  settings(): ResearchSettings;
  /** Cooldown guards and engine defaults from the research session surface. */
  session: CrawlSessionPolicy;
  citation(): CitationController;
  detachedView(): DetachedViewController;
  harvester(): ConstructHarvester;
  indexPage(url: string, title: string, content: string): Promise<number>;
  broadcast(channel: string, payload: unknown): void;
  log(level: 'info' | 'warn' | 'action', message: string): void;
}

/** The crawl, research-topic and activity-feed surface over the research session. */
export class CrawlSurface {
  private readonly crawler: Crawler;
  private readonly researcher: Researcher;
  private readonly orchestrator: CrawlOrchestrator;

  constructor(private readonly deps: CrawlSurfaceDeps) {
    // Autonomous multi-page crawl (TODO_RESEARCH_CRAWL.md §5, Feature 1).
    // Cheap path first: content-negotiated Markdown/Text, else a detached render.
    this.crawler = new Crawler({
      tryLlm: async (url) => {
        const llm = this.deps.researchLlm();
        const report = await llm.probe(url);
        if (!report.content_negotiation?.accepts_markdown) return null;
        const r = await llm.fetch({ url, as: 'markdown' });
        return { content: r.content, via: r.via };
      },
      fetchStatic: (url, pageOpts) => this.fetchStaticForCrawl(url, pageOpts),
      renderPage: (url, pageOpts) => this.orchestrator.crawlRenderPage(url, pageOpts),
      beforePage: (url) => this.deps.session.assertNotCooling(url),
      indexPage: async (url, title, content) => {
        await this.deps.indexPage(url, title, content);
      },
      log: this.deps.log,
    });

    // Autonomous research mode (TODO_RESEARCH_CRAWL.md §5, Feature 3).
    this.researcher = new Researcher({
      search: (query, opts) => this.deps.search(query, opts),
      crawl: (opts) => this.crawler.crawl(opts),
      log: this.deps.log,
      events: (event) => this.deps.broadcast('research:event', event),
    });

    this.orchestrator = new CrawlOrchestrator({
      settings: this.deps.settings,
      session: this.deps.session,
      citation: this.deps.citation(),
      detachedView: this.deps.detachedView(),
      crawler: this.crawler,
      researcher: this.researcher,
      broadcast: this.deps.broadcast,
      applyDelayFloor: (effective, opts) => {
        const settings = this.deps.settings();
        if (settings.enabled) {
          effective.delayMs = Math.max(Number(opts.delayMs ?? 0), settings.delayMs);
        }
      },
      log: this.deps.log,
    });
  }

  /** Renders a page in a detached view and returns its Markdown + outgoing links (for deep_crawl). */
  async crawlRenderPage(url: string, opts: RenderCrawlOptions = {}): Promise<RenderCrawlResult> {
    return this.orchestrator.crawlRenderPage(url, opts);
  }

  /** Depth/page-budgeted BFS crawl that indexes each page into Cortex (Feature 1). */
  async deepCrawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    return this.orchestrator.deepCrawl(opts);
  }

  /** search → gather top sources → distill → index; returns cited extractive evidence (Feature 3). */
  async researchTopic(opts: ResearchOptions): Promise<ResearchOutcome> {
    return this.orchestrator.researchTopic(opts);
  }

  /**
   * Run a research tool with the activity events the research feed expects: a
   * start broadcast, then a done broadcast carrying `ok`, duration and the
   * caller-computed success summary (the failure summary is the start summary).
   * Errors propagate after the failed broadcast.
   */
  async activity<T>(
    tool: string,
    summary: string,
    describe: (result: T) => string,
    run: () => Promise<T>,
  ): Promise<T> {
    const runId = randomUUID();
    const startedAt = Date.now();
    this.deps.broadcast('research:event', { type: 'activity', runId, tool, status: 'start', summary, at: startedAt });
    try {
      const result = await run();
      this.deps.broadcast('research:event', {
        type: 'activity',
        runId,
        tool,
        status: 'done',
        summary: describe(result),
        ok: true,
        ms: Date.now() - startedAt,
        at: Date.now(),
      });
      return result;
    } catch (error: any) {
      this.deps.broadcast('research:event', {
        type: 'activity',
        runId,
        tool,
        status: 'done',
        summary,
        ok: false,
        ms: Date.now() - startedAt,
        at: Date.now(),
      });
      throw error;
    }
  }

  /** The crawler's static tier: impersonating fetch, with warm-origin and thin-body guards. */
  private async fetchStaticForCrawl(
    url: string,
    pageOpts?: { anchorsFor?: string },
  ): Promise<
    | { ok: true; title: string; markdown: string; status: number; anchors?: CitationAnchor[] }
    | { ok: false; reason: string; disabled?: boolean }
  > {
    if (!this.deps.settings().preferStatic) {
      return { ok: false, reason: 'static tier disabled in settings', disabled: true };
    }
    try {
      if (this.deps.citation().originIsWarm(url)) {
        // A human authenticated this origin in the real browser; keep the cookie and the
        // browser together rather than replaying the session through a static client.
        return {
          ok: false,
          reason: 'origin is using the human-authenticated browser session',
          disabled: true,
        };
      }
    } catch {
      /* malformed URL falls through to the normal path */
    }
    const outcome = await fetchStatic(url);
    if (outcome.kind === 'blocked') {
      this.deps.log('warn', `static fetch challenged for ${url} (${outcome.status}); escalating to render`);
      return { ok: false, reason: `challenge page (${outcome.status})` };
    }
    if (outcome.kind === 'unavailable') return { ok: false, reason: outcome.reason, disabled: true };
    if (outcome.kind === 'error') return { ok: false, reason: outcome.reason };
    if (outcome.result.status >= 400) return { ok: false, reason: `HTTP ${outcome.result.status}` };

    const harvested = this.deps.harvester().harvest(outcome.result.body, url, url);
    // A JS-only shell harvests to almost nothing; escalate rather than index a stub.
    if (!harvested.content || harvested.content.trim().length < 200) {
      return { ok: false, reason: 'content too thin (possible JS-only shell)' };
    }
    let anchors: CitationAnchor[] | undefined;
    if (pageOpts?.anchorsFor) {
      anchors = (await this.deps.citation().anchorFromHtml(url, outcome.result.body, pageOpts.anchorsFor)) ?? [];
    }
    return {
      ok: true,
      title: harvested.title,
      markdown: harvested.content,
      status: outcome.result.status,
      anchors,
    };
  }
}
