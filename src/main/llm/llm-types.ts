/**
 * The LLM-surface vocabulary: what a site advertises, what a fetch returns, and what
 * `read_url` reports.
 *
 * Kept apart from probing so the MCP catalog and the crawler can type a surface report
 * without importing `net`/Electron.
 */

/** When to use: labelling which machine-readable surface a site advertises. */
export type LlmSurfaceKind = 'llms_txt' | 'llms_full' | 'markdown' | 'text';

/** When to use: saying whether a representation covers the whole site or just the page. */
export type LlmSurfaceScope = 'origin' | 'page';

/**
 * The machine-readable next action. `recommended: null` means "there is no
 * fetchable representation" and `next` points at the render path — so a caller
 * that plans only from the report can never mistake a strategy for a
 * representation and then be rejected by `fetch()`.
 */
/** When to use: following the paging chain (next index/document) a surface declares. */
export type LlmSurfaceNext =
  | { tool: 'llm_fetch'; as: LlmSurfaceKind }
  | { tool: 'observe'; as: 'markdown' };

/** When to use: describing one advertised surface endpoint (URL, type, scope). */
export interface LlmSurfaceEndpoint {
  found: boolean;
  url: string;
  status?: number;
  contentType?: string | null;
  bytes?: number;
  entries?: number;
}

/** When to use: listing a discovered surface link on a page or index. */
export interface LlmSurfaceLink {
  href: string;
  type: string;
  rel: string;
  /** How the alternate was discovered: a declared `<link rel="alternate">`, or a real `<a href="…">`. */
  source: 'link' | 'anchor';
  /**
   * True when this alternate belongs to the requested page (a declared `<link>`, or a
   * same-origin `<a>` whose path is this page's path + `.md`/`.txt`). Only page-level
   * candidates are auto-recommended; other anchors are reported but not auto-chosen.
   */
  page_level: boolean;
}

/** When to use: returning the probe result (endpoints, links, chosen surface, notes). */
export interface LlmSurfaceReport {
  url: string;
  origin: string;
  llms_txt: LlmSurfaceEndpoint;
  llms_full: LlmSurfaceEndpoint;
  sitemap: LlmSurfaceEndpoint;
  markdown_alternates: LlmSurfaceLink[];
  content_negotiation: { accepts_markdown: boolean; content_type: string | null };
  /** The fetchable representation, or `null` when the site advertises none (see `next`). */
  recommended: LlmSurfaceKind | null;
  /** Scope of `recommended` (`null` when `recommended` is `null`). */
  scope: LlmSurfaceScope | null;
  /** The unambiguous next step — always present, whatever `recommended` is. */
  next: LlmSurfaceNext;
  notes: string[];
}

/** When to use: returning a page fetched through its LLM surface (content, cursor, via). */
export interface LlmFetchResult {
  as: LlmSurfaceKind;
  url: string;
  /** What the returned content actually covers. */
  scope: LlmSurfaceScope;
  /** True when a specific page was requested but only an origin-level index could be returned. */
  scope_mismatch: boolean;
  contentType: string | null;
  bytes: number;
  content: string;
  via: 'net.fetch' | 'navigation';
}

/** When to use: reading the composite `read_url` result — always Markdown, paged. */
export interface ReadUrlResult {
  url: string;
  via: 'llm_fetch' | 'render';
  /** The representation kind when `via === 'llm_fetch'`, else null. */
  as: LlmSurfaceKind | null;
  scope: LlmSurfaceScope;
  scope_mismatch: boolean;
  contentType: string | null;
  title?: string;
  /** Total characters before `max_chars`/`cursor` paging. */
  total: number;
  offset: number;
  /** Offset to pass back as `cursor` for the next slice, or null when complete. */
  next_cursor: number | null;
  truncated: boolean;
  content: string;
  /** Why the cheap path was not used (present only when `via === 'render'`). */
  reason?: string;
}

/** When to use: injecting fetch/timeout dependencies when constructing LlmSurface. */
export interface LlmSurfaceDeps {
  getSession: () => Electron.Session;
  getActiveWebContents?: () => Electron.WebContents | null;
  /** Loads a URL as a real document navigation and returns its text (Tier B). */
  navigateForText?: (url: string) => Promise<{ body: string | null; contentType: string | null; status: number }>;
  /** Renders a URL in a detached view and distils it to Markdown (composite `read_url` fallback). */
  renderPage?: (url: string) => Promise<{ markdown: string; title?: string; status: number; contentType?: string | null }>;
  userAgent?: string;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
  ttlMs?: number;
}

/** When to use: caching what one origin advertises between probes. */
export interface OriginProbe {
  llms_txt: LlmSurfaceEndpoint;
  llms_full: LlmSurfaceEndpoint;
  sitemap: LlmSurfaceEndpoint;
  notes: string[];
}

/** When to use: caching what one page advertises between probes. */
export interface PageProbe {
  markdown_alternates: LlmSurfaceLink[];
  content_negotiation: { accepts_markdown: boolean; content_type: string | null };
}
