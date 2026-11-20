/**
 * The crawl's published surface: options in, one page/outcome record out, plus the
 * dependency hooks the chassis injects.
 *
 * Kept apart from the BFS so a caller (or the MCP catalog) can import the shapes
 * without pulling in the crawler's fetch tiers.
 *
 * When to use: typing a `deep_crawl` call, reading its result, or building the deps.
 */
import type { CitationAnchor } from '../research/anchors.js';

/** When to use: reporting a challenge/login wall the crawl hit, with hand-off details. */
export interface HumanAssistInfo {
  phase: 'needed' | 'done';
  url: string;
  reason?: string;
}

/** When to use: shaping a crawl (depth, same-origin, patterns, page cap). */
export interface CrawlOptions {
  startUrl: string;
  /** Link depth from the seed (default 2, max 5). Depth 0 = the seed only. */
  maxDepth?: number;
  /** Hard page budget (default 5, max 25). */
  maxPages?: number;
  /** Glob (e.g. "/docs/*") or /regex/ allow-list, matched against path or full URL. */
  matchPatterns?: string[];
  /** Stay on the seed's origin (default true). */
  sameOrigin?: boolean;
  /** Try content-negotiated Markdown/Text before rendering (default true). */
  preferLlm?: boolean;
  /** Try a static impersonating fetch before rendering (default true when available). */
  preferStatic?: boolean;
  /** Index each harvested page into LanceDB Cortex (default true). */
  harvestToCortex?: boolean;
  /** Scope link extraction to a CSS selector. */
  selector?: string;
  /** Politeness delay between pages in ms (default 300). */
  delayMs?: number;
  /** Parallel page fetches (default 1; max 4). Higher values increase WAF risk. */
  concurrency?: number;
  /** Include a leading excerpt (this many chars) of each page's Markdown in the result. */
  includeContent?: number;
  /** Notified when a page needs a human (challenge/login) and when the human is done. */
  onHuman?: (info: HumanAssistInfo) => void;
  /** When set, anchor matching text blocks to fingerprints for this query. */
  anchorsFor?: string;
  /** Called as each page finishes, so a caller can stream progress to the UI. */
  onPage?: (page: CrawlPage) => void;
}

/** When to use: returning one fetched page URL, status and content in the crawl summary. */
export interface CrawlPage {
  url: string;
  title: string;
  depth: number;
  via: 'llm' | 'static' | 'render';
  bytes: number;
  links: number;
  indexed: boolean;
  error?: string;
  /** True when a human cleared a challenge for this page. */
  humanAssisted?: boolean;
  /** Wall-clock time spent waiting for the human (included in `ms`). */
  humanMs?: number;
  /** Citation anchors when `anchorsFor` was supplied. */
  anchors?: CitationAnchor[];
  /** Wall-clock time spent on this page, including tier attempts. */
  ms?: number;
  /** Set when a cheaper tier was attempted and the page had to be rendered instead. */
  escalation?: { from: 'llm' | 'static'; to: 'render'; reason: string };
  /** Leading excerpt of the page's Markdown, when `includeContent` was set. */
  excerpt?: string;
}

/** When to use: reading the crawl result (pages, links, stops, assist requests). */
export interface CrawlOutcome {
  startUrl: string;
  pages: CrawlPage[];
  pageCount: number;
  depthReached: number;
  cortexIndexed: number;
  sameOrigin: boolean;
  truncated: boolean;
  notes: string[];
}

/** When to use: injecting fetch/harvest/log dependencies when constructing a Crawler. */
export interface CrawlerDeps {
  /** Content-negotiated Markdown/Text, or null when the page advertises none. */
  tryLlm?: (url: string) => Promise<{ content: string; via: string } | null>;
  /** Renders a page in a detached view and returns its Markdown + outgoing links. */
  renderPage: (
    url: string,
    pageOpts: {
      selector?: string;
      onHuman?: (info: HumanAssistInfo) => void;
      anchorsFor?: string;
    },
  ) => Promise<{
    title: string;
    markdown: string;
    links: string[];
    status: number;
    humanAssisted?: boolean;
    humanMs?: number;
    anchors?: CitationAnchor[];
  }>;
  /**
   * Cheap HTML fetch without a browser (impersonating client, then distilled to Markdown).
   * `ok: false` escalates to `renderPage`; the reason is reported to the caller.
   */
  fetchStatic?: (
    url: string,
    opts?: { anchorsFor?: string },
  ) => Promise<
    | {
        ok: true;
        title: string;
        markdown: string;
        status: number;
        anchors?: CitationAnchor[];
      }
    | { ok: false; reason: string; disabled?: boolean }
  >;
  /** Called before any page fetch; lets stealth mode enforce a domain cooldown. */
  beforePage?: (url: string) => void | Promise<void>;
  indexPage?: (url: string, title: string, content: string) => Promise<void>;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
}
