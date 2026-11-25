/**
 * The LLM/search stack.
 *
 * Builds the two LLM surfaces (active tab and research session), the search hub,
 * the agent-facing read/search adapters and the crawl surface that consumes them.
 * The chassis supplies the tab, the research session/view and the activity hook;
 * this module owns the composition order.
 */
import type { Session, WebContents } from 'electron';
import type { ConstructHarvester } from '../harvester/markdown.js';
import { engineHost } from '../search/search-engine.js';
import { LlmSurface } from '../llm/llm-surface.js';
import { ReadSurface } from '../llm/read-surface.js';
import { SearchHub } from '../search/search-engine.js';
import { SearchSurface } from '../search/search-surface.js';
import { CrawlSurface } from '../research/crawl-surface.js';
import type { ResearchSessionSurface } from '../research/research-session-surface.js';
import type { ResearchViewSurface } from '../research/research-view-surface.js';
import { researchError } from '../research/session-controller.js';
import type { SurfaceActivityDeps } from '../research/surface-activity.js';

/** Dependencies the LLM stack needs from the chassis. */
export interface LlmStackDeps extends SurfaceActivityDeps {
  activeSession(): Session;
  activeWebContents(): WebContents | null;
  navigateForText(url: string): Promise<{ body: string | null; contentType: string | null; status: number }>;
  userAgent: string;
  renderMarkdown(url: string): Promise<{ markdown: string; title: string; status: number; contentType: string | null }>;
  research: ResearchSessionSurface;
  researchView: ResearchViewSurface;
  harvester(): ConstructHarvester;
  indexPage(url: string, title: string, content: string): Promise<number>;
  broadcast(channel: string, payload: unknown): void;
}

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
export function createLlmStack(deps: LlmStackDeps): LlmStack {
  const navigateForText = (url: string) => deps.navigateForText(url);
  // LLM-friendly site discovery (TODO_RESEARCH_CRAWL.md §5, Feature 6).
  // `net.fetch` runs on Chromium's network stack (session cookies/UA/TLS); per-page
  // alternates go through a real document navigation instead of a synthetic fetch.
  const llmSurface = new LlmSurface({
    getSession: () => deps.activeSession(),
    getActiveWebContents: () => deps.activeWebContents(),
    navigateForText,
    userAgent: deps.userAgent,
    log: (level, msg) => deps.log(level, msg),
    renderPage: (url) => deps.renderMarkdown(url),
  });

  const researchLlmSurface = new LlmSurface({
    getSession: () => deps.research.session(),
    navigateForText,
    userAgent: deps.userAgent,
    log: (level, msg) => deps.log(level, msg),
  });

  // Multi-engine web search (TODO_RESEARCH_CRAWL.md §5, Feature 5).
  const searchHub = new SearchHub({
    load: (url, script, opts) => deps.researchView.load(url, script, opts),
    log: (level, msg) => deps.log(level, msg),
  });

  const llm = new ReadSurface({
    probe: (url) => llmSurface.probe(url),
    fetch: (opts) => llmSurface.fetch(opts),
    readUrl: (opts) => llmSurface.readUrl(opts),
    renderMarkdown: (url) => deps.renderMarkdown(url),
    activity: deps.activity,
    log: deps.log,
  });

  const search = new SearchSurface({
    hub: searchHub,
    settings: () => deps.research.settings(),
    applyEnginePolicy: (effective) => deps.research.applyEnginePolicy(effective),
    isCooling: (host) => deps.research.isCooling(host),
    markCooldown: (host, reason) => deps.research.markCooldown(host, reason),
    engineHost: (engine) => engineHost(engine, deps.research.settings().urlTemplate),
    error: researchError,
    activity: deps.activity,
    log: deps.log,
  });

  const crawl = new CrawlSurface({
    researchLlm: () => researchLlmSurface,
    search: (query, opts) => searchHub.search(query, opts),
    settings: () => deps.research.settings(),
    session: deps.research,
    citation: () => deps.researchView.citations,
    detachedView: () => deps.researchView.detached,
    harvester: () => deps.harvester(),
    indexPage: (url, title, content) => deps.indexPage(url, title, content),
    broadcast: (channel, payload) => deps.broadcast(channel, payload),
    log: (level, message) => deps.log(level, message),
  });

  return { llmSurface, researchLlmSurface, searchHub, llm, search, crawl };
}
