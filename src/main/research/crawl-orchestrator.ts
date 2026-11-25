/**
 * The crawl and research-run orchestration: render a page for the crawler with
 * challenge escalation, run the BFS crawl with its research-workspace event
 * mirror, and dispatch a topic research run.
 *
 * Why a module: the three runs compose the crawler, the researcher, the
 * detached view, the hand-off and the cooldown policy — five collaborators the
 * chassis otherwise only holds. One controller owns the sequence and the event
 * mirroring; the chassis keeps thin delegations and the settings getter.
 */
import { randomUUID } from 'node:crypto';
import { RenderedSnapshotEngine } from '../snapshots/rendered-snapshot.js';
import { looksLikeChallenge } from './settings.js';
import type { ResearchSettings } from './settings.js';
import type { Crawler, CrawlOptions, CrawlOutcome, CrawlPage, HumanAssistInfo } from '../crawl/crawler.js';
import type { Researcher, ResearchOptions, ResearchOutcome } from '../research/researcher.js';
import type { CitationAnchor } from './anchors.js';
import type { DetachedViewController } from './detached-view.js';
import type { CitationController } from './citation-controller.js';
import { researchError } from './errors.js';

/** The running totals of one BFS crawl, mirrored into the research feed. */
interface CrawlTally {
  tiers: Record<'llm' | 'static' | 'render', number>;
  sources: number;
  indexed: number;
  bytes: number;
  humans: number;
  anchors: number;
  escalations: number;
  rank: number;
}

/** The session policy a crawl run needs: cooldown guards and engine defaults. */
export interface CrawlSessionPolicy {
  assertNotCooling(url: string): void;
  markCooldown(host: string, reason: string): void;
  applyEnginePolicy<T extends { engine?: string; engines?: string[]; urlTemplate?: string }>(effective: T): void;
}

/** When to use: building the chassis — the five collaborators a run composes. */
export interface CrawlOrchestratorDeps {
  settings: () => ResearchSettings;
  session: CrawlSessionPolicy;
  citation: CitationController;
  detachedView: DetachedViewController;
  crawler: Crawler;
  researcher: Researcher;
  /** The research-workspace feed (run-start, source lifecycle, run-done events). */
  broadcast: (channel: string, payload: unknown) => void;
  /** The stealth delay floor: a run's delay never undercuts the configured one. */
  applyDelayFloor: (effective: { delayMs?: number }, opts: { delayMs?: number }) => void;
  log: (level: 'info' | 'warn' | 'action', message: string) => void;
}

/** The options a crawl page render accepts. */
export interface RenderCrawlOptions {
  selector?: string;
  waitUntilIdleMs?: number;
  onHuman?: (info: HumanAssistInfo) => void;
  anchorsFor?: string;
}

/** The result of rendering one crawl page: markdown, links, status, optional hand-off facts. */
export interface RenderCrawlResult {
  title: string;
  markdown: string;
  links: string[];
  status: number;
  humanAssisted?: boolean;
  humanMs?: number;
  anchors?: CitationAnchor[];
}

/** When to use: the chassis — own how crawl and topic research runs are orchestrated. */
export class CrawlOrchestrator {
  private readonly deps: CrawlOrchestratorDeps;

  constructor(deps: CrawlOrchestratorDeps) {
    this.deps = deps;
  }

  /**
   * Render one page for the crawler: real document navigation in the detached
   * view, links + Markdown harvested in the same queued slot, and a challenge
   * escalated to the human hand-off before failing.
   */
  async crawlRenderPage(url: string, opts: RenderCrawlOptions = {}): Promise<RenderCrawlResult> {
    this.deps.session.assertNotCooling(url);
    const sel = opts.selector ? JSON.stringify(opts.selector) : "'a[href]'";
    const script = `(() => {
      const out = new Set();
      for (const a of document.querySelectorAll(${sel})) {
        const href = a.href;
        if (!href || !/^https?:/i.test(href)) continue;
        out.add(href.split('#')[0]);
      }
      return { title: document.title || '', links: Array.from(out).slice(0, 400) };
    })()`;
    const r = await this.deps.detachedView.load<{ title: string; links: string[] }>(url, script, {
      timeoutMs: 25000,
      after: async (wc) => {
        const markdown = (
          await RenderedSnapshotEngine.capture(wc, { format: 'markdown', waitUntilIdleMs: opts.waitUntilIdleMs ?? 400 })
        ).content;
        // Read the document in the same queued slot as the render. Capturing it later would race
        // another detached read and could anchor the wrong page.
        const html = opts.anchorsFor
          ? await wc.executeJavaScript('document.documentElement.outerHTML').catch(() => '')
          : '';
        return { markdown, html };
      },
    });
    const rendered =
      r.after && typeof r.after === 'object'
        ? (r.after as { markdown?: string; html?: string })
        : { markdown: typeof r.after === 'string' ? r.after : '', html: '' };
    const markdown = rendered.markdown || '';

    // A challenge must always stop the pipeline — otherwise the interstitial is returned and
    // indexed as if it were the page. Human hand-off is attempted before failing.
    if (looksLikeChallenge(r.status, markdown)) {
      let host = '';
      try {
        host = new URL(url).hostname;
      } catch {
        /* ignore */
      }

      // Give the human a chance to clear the challenge in the same session.
      const handoff = await this.deps.citation.attemptHandoff(url, opts.onHuman, opts.anchorsFor);
      if (handoff) return handoff;

      const skip = this.deps.citation.skipReason ? ` — ${this.deps.citation.skipReason}` : '';
      this.deps.session.markCooldown(host, 'WAF/challenge page');
      throw researchError(
        'WAF_CHALLENGE',
        `${host || url} returned a WAF/challenge page${skip}.`,
      );
    }

    const anchors = opts.anchorsFor && rendered.html
      ? await this.deps.citation.anchorFromHtml(url, rendered.html, opts.anchorsFor)
      : undefined;

    return {
      title: r.result?.title || url,
      links: r.result?.links || [],
      markdown,
      status: r.status,
      anchors,
    };
  }

  /** Depth/page-budgeted BFS crawl that indexes each page into Cortex (Feature 1). */
  async deepCrawl(opts: CrawlOptions): Promise<CrawlOutcome> {
    const settings = this.deps.settings();
    const effective: CrawlOptions = {
      ...opts,
      maxPages: opts.maxPages ?? settings.defaultMaxPages,
      preferLlm: opts.preferLlm ?? settings.preferLlm,
      preferStatic: opts.preferStatic ?? settings.preferStatic,
      concurrency: opts.concurrency ?? settings.crawlConcurrency,
    };
    this.deps.applyDelayFloor(effective, opts);
    this.deps.log(
      'action',
      `MCP Directive: deep_crawl(${effective.startUrl}, depth=${effective.maxDepth ?? 2}, pages=${effective.maxPages ?? 5}, concurrency=${effective.concurrency ?? 1}${settings.enabled ? ', stealth' : ''})`,
    );
    // Mirror the crawl into the research workspace, which otherwise only sees `research_topic`.
    // The panel opens on run-start and fills its source table as each page finishes.
    const runId = randomUUID();
    const startedAt = Date.now();
    const maxPages = effective.maxPages ?? 5;
    const tally: CrawlTally = {
      tiers: { llm: 0, static: 0, render: 0 },
      sources: 0,
      indexed: 0,
      bytes: 0,
      humans: 0,
      anchors: 0,
      escalations: 0,
      rank: 0,
    };

    this.deps.broadcast('research:event', {
      type: 'run-start',
      runId,
      query: `Crawl ${effective.startUrl}`,
      maxSources: maxPages,
      at: startedAt,
    });

    try {
      const outcome = await this.deps.crawler.crawl({
        ...effective,
        onPage: (page) => this.mirrorPage(runId, tally, page),
      });

      this.deps.broadcast('research:event', {
        type: 'run-done',
        runId,
        sources: tally.sources,
        indexed: tally.indexed,
        bytes: tally.bytes,
        tiers: tally.tiers,
        humans: tally.humans,
        anchors: tally.anchors,
        elapsedMs: Date.now() - startedAt,
        escalations: tally.escalations,
        notes: [...outcome.notes],
        at: Date.now(),
      });
      return outcome;
    } catch (error: any) {
      this.deps.broadcast('research:event', {
        type: 'run-error',
        runId,
        message: error?.message || String(error),
        at: Date.now(),
      });
      throw error;
    }
  }

  /** Mirror one crawled page into the research workspace as a source-start/done pair. */
  private mirrorPage(runId: string, tally: CrawlTally, page: CrawlPage): void {
    tally.rank += 1;
    tally.sources += 1;
    tally.bytes += page.bytes;
    tally.tiers[page.via] += 1;
    if (page.indexed) tally.indexed += 1;
    if (page.humanAssisted) tally.humans += 1;
    if (page.anchors?.length) tally.anchors += page.anchors.length;
    if (page.escalation) tally.escalations += 1;

    const title = page.title || page.url;
    this.deps.broadcast('research:event', {
      type: 'source-start',
      runId,
      rank: tally.rank,
      url: page.url,
      title,
      at: Date.now(),
    });
    this.deps.broadcast('research:event', {
      type: 'source-done',
      runId,
      rank: tally.rank,
      url: page.url,
      title,
      via: page.via,
      bytes: page.bytes,
      ms: page.ms ?? 0,
      highlights: 0,
      indexed: page.indexed,
      humanAssisted: page.humanAssisted,
      humanMs: page.humanMs,
      anchors: page.anchors?.length ?? 0,
      anchorDetails: (page.anchors ?? []).map((anchor) => ({
        text: anchor.text,
        path: anchor.path,
        fingerprint: anchor.fingerprint as unknown as Record<string, unknown>,
      })),
      escalation: page.escalation,
      error: page.error,
      at: Date.now(),
    });
  }

  /** search → gather top sources → distill → index; returns cited extractive evidence (Feature 3). */
  async researchTopic(opts: ResearchOptions): Promise<ResearchOutcome> {
    const settings = this.deps.settings();
    const effective: ResearchOptions = {
      ...opts,
      maxSources: opts.maxSources ?? settings.defaultMaxSources,
      preferLlm: opts.preferLlm ?? settings.preferLlm,
      preferStatic: opts.preferStatic ?? settings.preferStatic,
    };
    // Research must honour the configured engine chain; otherwise the hub's default decides.
    this.deps.session.applyEnginePolicy(effective);
    this.deps.applyDelayFloor(effective, opts);
    this.deps.log(
      'action',
      `MCP Directive: research_topic("${effective.query}", maxSources=${effective.maxSources ?? 5}${this.deps.settings().enabled ? ', stealth' : ''})`,
    );
    return this.deps.researcher.research(effective);
  }
}
