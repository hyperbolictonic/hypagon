/**
 * The HTTP and text primitives the LLM-surface probe shares.
 *
 * `net.fetch` goes through the browser session, so the request carries the same cookies and
 * fingerprint as a navigation. Content-type checks are deliberately strict: a response that
 * comes back `text/html` is "no surface", never Markdown.
 *
 * When to use: LlmProbe and LlmSurface — both fetch well-known paths and both need the same
 * accept headers and content-type rules.
 */
import { net } from 'electron';
import type { LlmSurfaceDeps } from './llm-types.js';

/** When to use: reading well-known static files (llms.txt, sitemap.xml). */
export const TEXT_ACCEPT = 'text/plain, text/markdown, application/xml, text/xml, */*';
/** When to use: the single HEAD that asks whether a page negotiates Markdown. */
export const NEGOTIATE_ACCEPT = 'text/markdown, text/plain, text/html;q=0.8, */*;q=0.5';

/** When to use: recognising a Markdown alternate by type or `.md` suffix. */
export const MARKDOWN_LINK_RE = /markdown|\.md($|[?#])/i;
/** When to use: recognising a plain-text alternate by `.txt` suffix. */
export const TEXT_LINK_RE = /\.txt($|[?#])/i;

/** Default page budget for `read_url` (a long ToS page exceeds a single call). */
export const DEFAULT_READ_CHARS = 20_000;
/** When to use: the hard cap on one `read_url` slice. */
export const MAX_READ_CHARS = 50_000;

/** When to use: throwing an error the bridge maps onto a published code. */
export function coded(code: string, message: string): Error {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

/** When to use: one GET/HEAD through the browser session (cookies, UA, redirects). */
export async function netGet(
  deps: Pick<LlmSurfaceDeps, 'getSession' | 'userAgent'>,
  url: string,
  accept: string,
  method: 'GET' | 'HEAD',
): Promise<{ status: number; contentType: string | null; body: string; bytes: number }> {
  const session = deps.getSession();
  const headers: Record<string, string> = { Accept: accept };
  if (deps.userAgent) headers['User-Agent'] = deps.userAgent;
  const res = await net.fetch(url, { method, headers, session, redirect: 'follow' } as any);
  const contentType = res.headers.get('content-type');
  const body = method === 'HEAD' ? '' : await res.text();
  return { status: res.status, contentType, body, bytes: body.length };
}

/** When to use: deciding whether a content type is readable text at all. */
export function isTextual(ct: string | null): boolean {
  if (!ct) return false;
  const t = ct.split(';')[0].trim().toLowerCase();
  return t.startsWith('text/') || t === 'application/xml' || t === 'application/json';
}

/** When to use: refusing a response that is HTML (it is not a Markdown surface). */
export function isHtml(ct: string | null): boolean {
  if (!ct) return false;
  return ct.split(';')[0].trim().toLowerCase() === 'text/html';
}

/** When to use: comparing two URLs as the same page (fragment and trailing slash ignored). */
export function normalizeUrl(u: string): string {
  try {
    const x = new URL(u);
    x.hash = '';
    return x.toString().replace(/\/$/, '');
  } catch {
    return (u || '').trim();
  }
}
