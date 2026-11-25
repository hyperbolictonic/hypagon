/**
 * The HTTP transport for surface probing: session-bound `net.fetch`, plus the
 * content-type questions every caller asks.
 *
 * Why a module: the probe, the negotiation HEAD and the gated fetch all send
 * the same headers through the same session. One place owns them, so a UA or
 * redirect change lands once.
 */
import { net, type Session } from 'electron';

/** What one probe request returned. */
export interface ProbeResponse {
  status: number;
  contentType: string | null;
  body: string;
  bytes: number;
}

/** When to use: constructing the transport — the session comes from the chassis. */
export interface ProbeTransportDeps {
  getSession: () => Session;
  userAgent?: string;
}

/** When to use: any `llm_surface` request — well-known files, a HEAD, or a gated fetch. */
export class ProbeTransport {
  constructor(private readonly deps: ProbeTransportDeps) {}

  async get(url: string, accept: string, method: 'GET' | 'HEAD'): Promise<ProbeResponse> {
    const session = this.deps.getSession();
    const headers: Record<string, string> = { Accept: accept };
    if (this.deps.userAgent) headers['User-Agent'] = this.deps.userAgent;
    const res = await net.fetch(url, { method, headers, session, redirect: 'follow' } as any);
    const contentType = res.headers.get('content-type');
    const body = method === 'HEAD' ? '' : await res.text();
    return { status: res.status, contentType, body, bytes: body.length };
  }

  /** True for a representation we can safely treat as text (never `text/html`). */
  isTextual(ct: string | null): boolean {
    if (!ct) return false;
    const t = ct.split(';')[0].trim().toLowerCase();
    return t.startsWith('text/') || t === 'application/xml' || t === 'application/json';
  }

  /** True when the server answered with a page, which is never an LLM surface. */
  isHtml(ct: string | null): boolean {
    if (!ct) return false;
    return ct.split(';')[0].trim().toLowerCase() === 'text/html';
  }
}
