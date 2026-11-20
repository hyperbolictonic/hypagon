/**
 * The composite `read_url` helpers: paging and the render fallback.
 *
 * `read_url` always returns Markdown, so a caller never branches on `recommended`. A long
 * document is sliced with `max_chars`/`cursor` instead of being silently truncated, and a
 * page with no advertised surface is rendered in a detached view rather than reported as a
 * fetchable kind.
 *
 * When to use: `LlmSurface.readUrl` and `renderFallback`.
 */
import { coded, DEFAULT_READ_CHARS, MAX_READ_CHARS } from './llm-net.js';
import type { LlmSurfaceDeps, LlmSurfaceKind, LlmSurfaceScope, ReadUrlResult } from './llm-types.js';

/** When to use: shaping a full document into one paged `read_url` result. */
export function pageResult(input: {
  url: string;
  via: 'llm_fetch' | 'render';
  as: LlmSurfaceKind | null;
  scope: LlmSurfaceScope;
  scope_mismatch: boolean;
  contentType: string | null;
  title?: string;
  full: string;
  opts: { maxChars?: number; cursor?: number | string };
  reason?: string;
}): ReadUrlResult {
  const full = input.full || '';
  const max = Math.min(Math.max(Number(input.opts.maxChars) || DEFAULT_READ_CHARS, 500), MAX_READ_CHARS);
  const offset = Math.max(Math.floor(Number(input.opts.cursor)) || 0, 0);
  const content = full.slice(offset, offset + max);
  const end = offset + content.length;
  const truncated = end < full.length;
  return {
    url: input.url,
    via: input.via,
    as: input.as,
    scope: input.scope,
    scope_mismatch: input.scope_mismatch,
    contentType: input.contentType,
    title: input.title,
    total: full.length,
    offset,
    next_cursor: truncated ? end : null,
    truncated,
    content,
    reason: input.reason,
  };
}

/** When to use: no fetchable surface (or a failed fetch) — render the page to Markdown. */
export async function renderFallback(
  deps: Pick<LlmSurfaceDeps, 'renderPage'>,
  url: string,
  reason: string,
  opts: { maxChars?: number; cursor?: number | string },
): Promise<ReadUrlResult> {
  if (!deps.renderPage) {
    throw coded('NOT_SUPPORTED', `No render fallback is wired for read_url (cannot render ${url}).`);
  }
  const r = await deps.renderPage(url);
  if (!r.markdown) {
    throw coded('FETCH_BLOCKED', `Rendering ${url} produced no text (status ${r.status}).`);
  }
  return pageResult({
    url,
    via: 'render',
    as: null,
    scope: 'page',
    scope_mismatch: false,
    contentType: r.contentType ?? 'text/markdown',
    title: r.title,
    full: r.markdown,
    opts,
    reason,
  });
}
