/**
 * The small URL questions the surface module asks, as pure functions.
 *
 * Why a module: "is this a page or an origin", "what scope does this kind
 * cover", "which URL did the caller mean" and "what is this URL's cache key"
 * are asked by the probe and the facade. Pure functions keep them testable and
 * keep both classes inside the method budget.
 */
import type { LlmSurfaceKind, LlmSurfaceScope } from './surface-types.js';
import { coded } from './surface-types.js';

/** A URL with a non-root path is "a page", which should prefer a page-level representation. */
export function isPageUrl(u: string): boolean {
  try {
    return new URL(u).pathname.replace(/\/+$/, '').length > 0;
  } catch {
    return false;
  }
}

/** Origin-level kinds cover the whole site; markdown/text cover one page. */
export function kindScope(kind: LlmSurfaceKind): LlmSurfaceScope {
  return kind === 'llms_txt' || kind === 'llms_full' ? 'origin' : 'page';
}

/**
 * The URL the caller meant: the explicit one, or the active tab's. Anything
 * that is not http(s) is a typed BAD_REQUEST, because probing is a network act.
 */
export function resolveSurfaceUrl(url: string | undefined, activeUrl: (() => string) | undefined): string {
  const candidate = (url || '').trim();
  if (candidate) {
    if (!/^https?:\/\//i.test(candidate)) throw coded('BAD_REQUEST', `llm_surface needs an http(s) URL (got "${candidate}").`);
    return candidate;
  }
  const current = activeUrl?.() || '';
  if (!/^https?:\/\//i.test(current)) throw coded('BAD_REQUEST', 'No URL given and the active tab is not on an http(s) page.');
  return current;
}

/** Cache key: the URL without its hash or a trailing slash. */
export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = '';
    return x.toString().replace(/\/$/, '');
  } catch {
    return (u || '').trim();
  }
}
