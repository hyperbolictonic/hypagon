/**
 * The LLM-surface contract: representation kinds, the probe report, fetch and
 * read results, the dependency shape and the shared constants.
 *
 * Why a module: the probe, the alternate reader, the transport and the facade
 * all speak these types. Keeping them in `llm-surface.ts` would make every
 * helper import the facade that composes it.
 */
import type { Session, WebContents } from 'electron';

/** A *fetchable* LLM-friendly representation. Deliberately excludes "rendered". */
export type LlmSurfaceKind = 'llms_txt' | 'llms_full' | 'markdown' | 'text';

/** Whether a representation covers the whole site (`origin`) or just the page (`page`). */
export type LlmSurfaceScope = 'origin' | 'page';

/**
 * The machine-readable next action. `recommended: null` means "there is no
 * fetchable representation" and `next` points at the render path — so a caller
 * that plans only from the report can never mistake a strategy for a
 * representation and then be rejected by `fetch()`.
 */
export type LlmSurfaceNext =
  | { tool: 'llm_fetch'; as: LlmSurfaceKind }
  | { tool: 'observe'; as: 'markdown' };

/** When to use: reading one well-known endpoint's result in the report. */
export interface LlmSurfaceEndpoint {
  found: boolean;
  url: string;
  status?: number;
  contentType?: string | null;
  bytes?: number;
  entries?: number;
}

/** When to use: one advertised Markdown/Text alternate found on a page. */
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

/** When to use: the `llm_surface` tool's answer. */
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

/** When to use: the `llm_fetch` tool's answer. */
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

/** Result of the composite `read_url`: always Markdown text, paged for long documents. */
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

/** Everything `LlmSurface` needs from the chassis. */
export interface LlmSurfaceDeps {
  getSession: () => Session;
  getActiveWebContents?: () => WebContents | null;
  /** Loads a URL as a real document navigation and returns its text (Tier B). */
  navigateForText?: (url: string) => Promise<{ body: string | null; contentType: string | null; status: number }>;
  /** Renders a URL in a detached view and distils it to Markdown (composite `read_url` fallback). */
  renderPage?: (url: string) => Promise<{ markdown: string; title?: string; status: number; contentType?: string | null }>;
  userAgent?: string;
  log?: (level: 'info' | 'warn' | 'action', message: string) => void;
  ttlMs?: number;
}

/** The origin-level probe shape (well-known files only). */
export interface OriginProbe {
  llms_txt: LlmSurfaceEndpoint;
  llms_full: LlmSurfaceEndpoint;
  sitemap: LlmSurfaceEndpoint;
  notes: string[];
}

/** The page-level probe shape (live DOM alternates + one negotiation HEAD). */
export interface PageProbe {
  markdown_alternates: LlmSurfaceLink[];
  content_negotiation: { accepts_markdown: boolean; content_type: string | null };
}

/** Accept header for a plain GET (well-known files, an advertised alternate). */
export const TEXT_ACCEPT = 'text/plain, text/markdown, application/xml, text/xml, */*';
/** Accept header for content negotiation: prefer Markdown, fall back to the page. */
export const NEGOTIATE_ACCEPT = 'text/markdown, text/plain, text/html;q=0.8, */*;q=0.5';

/** Matches a link type or href that means Markdown. */
export const MARKDOWN_LINK_RE = /markdown|\.md($|[?#])/i;
/** Matches a link whose href is a plain-text document. */
export const TEXT_LINK_RE = /\.txt($|[?#])/i;
/** Default page budget for `read_url` (a long ToS page exceeds a single call). */
export const DEFAULT_READ_CHARS = 20_000;
/** Hard ceiling for one `read_url` page, whatever the caller asks for. */
export const MAX_READ_CHARS = 50_000;

/** An `Error` with the bridge's typed `code` attached. */
export function coded(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}
