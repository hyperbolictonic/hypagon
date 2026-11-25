/**
 * The LLM/search/crawl stack.
 *
 * Builds the two LLM surfaces (active tab and research session), the search hub,
 * the agent-facing read/search adapters and the crawl surface that consumes them.
 * The host supplies the tab, the research session/view and the activity hook;
 * this module owns the composition order.
 */
import { activeWebContents, readUrlRender } from './accessors.js';
import { engineHost } from '../search/search-engine.js';
import { LlmSurface } from '../llm/llm-surface.js';
import { ReadSurface } from '../llm/read-surface.js';
import { SearchHub } from '../search/search-engine.js';
import { SearchSurface } from '../search/search-surface.js';
import { CrawlSurface } from '../research/crawl-surface.js';
import { researchError } from '../research/errors.js';
import { cortex } from '../cortex/cortex-db.js';
import type { ChassisHost } from './host.js';

/** The built LLM/read/search/crawl surfaces. */
export interface LlmStack {
  llmSurface: LlmSurface;
  researchLlmSurface: LlmSurface;
  searchHub: SearchHub;
  llm: ReadSurface;
  search: SearchSurface;
  crawl: CrawlSurface;
}

/** When to use: the chassis constructor — build the read/search/crawl stack once. */
export function createLlmStack(host: ChassisHost): LlmStack {
  const navigateForText = (url: string) => host.researchView.navigateForText(url);
  // LLM-friendly site discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6).
  // `net.fetch` runs on Chromium's network stack (session cookies/UA/TLS); per-page
  // alternates go through a real document navigation instead of a synthetic fetch.
  const llmSurface = new LlmSurface({
    getSession: () => activeWebContents(host).session,
    getActiveWebContents: () => {
      try {
        return activeWebContents(host);
      } catch {
        return null;
      }
    },
    navigateForText,
    userAgent: host.hostProfile.userAgent,
    log: host.log,
    renderPage: (url) => readUrlRender(host, url),
  });

  const researchLlmSurface = new LlmSurface({
    getSession: () => host.research.session(),
    navigateForText,
    userAgent: host.hostProfile.userAgent,
    log: host.log,
  });

  // Multi-engine web search (TODO_RESEARCH_CRAWL.md §5, Feature 5).
  const searchHub = new SearchHub({
    load: (url, script, opts) => host.researchView.load(url, script, opts),
    log: host.log,
  });

  const activity = <T>(tool: string, summary: string, describe: (result: T) => string, run: () => Promise<T>): Promise<T> =>
    host.crawl.activity(tool, summary, describe, run);

  const llm = new ReadSurface({
    probe: (url) => llmSurface.probe(url),
    fetch: (opts) => llmSurface.fetch(opts),
    readUrl: (opts) => llmSurface.readUrl(opts),
    renderMarkdown: (url) => readUrlRender(host, url),
    activity,
    log: host.log,
  });

  const search = new SearchSurface({
    hub: searchHub,
    settings: () => host.research.settings(),
    applyEnginePolicy: (effective) => host.research.applyEnginePolicy(effective),
    isCooling: (hostname) => host.research.isCooling(hostname),
    markCooldown: (hostname, reason) => host.research.markCooldown(hostname, reason),
    engineHost: (engine) => engineHost(engine, host.research.settings().urlTemplate),
    error: researchError,
    activity,
    log: host.log,
  });

  const crawl = new CrawlSurface({
    researchLlm: () => researchLlmSurface,
    search: (query, opts) => searchHub.search(query, opts),
    settings: () => host.research.settings(),
    session: host.research,
    citation: () => host.researchView.citations,
    detachedView: () => host.researchView.detached,
    harvester: () => host.harvester,
    indexPage: (url, title, content) => cortex.history.indexPage(url, title, content),
    broadcast: (channel, payload) => host.bus.broadcast(channel, payload),
    log: host.log,
  });

  return { llmSurface, researchLlmSurface, searchHub, llm, search, crawl };
}
