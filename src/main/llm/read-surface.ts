/**
 * The agent-facing read surface over `LlmSurface`.
 *
 * The transport, negotiation and detached render live in `LlmSurface` and
 * `DetachedViewController`; this controller adds the activity events, the MCP
 * directive log and the `read_url`/`llm_fetch`/`llm_surface` contract that the
 * bridge routes expose.
 */
import type { LlmFetchResult, LlmSurfaceKind, LlmSurfaceReport, ReadUrlResult } from './llm-surface.js';
import type { SurfaceActivityDeps } from '../research/surface-activity.js';

/** Dependencies the read surface needs from the chassis transports. */
export interface ReadSurfaceDeps extends SurfaceActivityDeps {
  probe(url?: string): Promise<LlmSurfaceReport>;
  fetch(opts: { url?: string; as?: LlmSurfaceKind }): Promise<LlmFetchResult>;
  readUrl(opts: { url?: string; maxChars?: number; cursor?: number | string; as?: LlmSurfaceKind }): Promise<ReadUrlResult>;
  /** Render a URL in the detached view and distil it to Markdown. */
  renderMarkdown(url: string): Promise<{ markdown: string; title: string; status: number; contentType: string | null }>;
}

/** The agent-facing read surface over LlmSurface. */
export class ReadSurface {
  constructor(private readonly deps: ReadSurfaceDeps) {}

  async probe(url?: string): Promise<LlmSurfaceReport> {
    this.deps.log('action', `MCP Directive: llm_surface(${url || 'active tab'})`);
    return await this.deps.probe(url);
  }

  async fetch(opts: { url?: string; as?: LlmSurfaceKind } = {}): Promise<LlmFetchResult> {
    this.deps.log('action', `MCP Directive: llm_fetch(${opts.url || 'active tab'}, as=${opts.as || 'auto'})`);
    const summary = opts.url || 'active tab';
    return this.deps.activity('llm_fetch', summary, () => summary, () => this.deps.fetch(opts));
  }

  async readUrl(
    opts: { url?: string; maxChars?: number; cursor?: number | string; as?: LlmSurfaceKind } = {},
  ): Promise<ReadUrlResult> {
    this.deps.log(
      'action',
      `MCP Directive: read_url(${opts.url || 'active tab'}${opts.maxChars ? `, max_chars=${opts.maxChars}` : ''}${opts.cursor ? `, cursor=${opts.cursor}` : ''})`,
    );
    const summary = opts.url || 'active tab';
    return this.deps.activity('read_url', summary, () => summary, () => this.deps.readUrl(opts));
  }

  /** The composite `read_url` fallback: detached render distilled to Markdown. */
  async renderMarkdown(url: string): Promise<{ markdown: string; title: string; status: number; contentType: string | null }> {
    return this.deps.renderMarkdown(url);
  }
}
