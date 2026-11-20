/**
 * Citations: resolving a quote to a stored anchor, revalidating saved citations and fetching the
 * source HTML for a highlight.
 *
 * Extracted from `BrowserChassis` (issue #10); the chassis exposes it as `chassis.citations`.
 */
import { fetchStatic } from '../network/impersonate.js';
import {
  relocateCitation as relocateAgainstHtml,
  relocateCitations as relocateMany,
  type CitationRelocation,
} from '../research/anchors.js';
import { looksLikeChallenge } from '../research/settings.js';

/** When to use: constructing the citation surface from the chassis' own services. */
export interface CitationSurfaceDeps {
  anchorStore: any;
  researchSettings: any;
  researchError: (code: string, message: string) => Error;
  loadDetached: <T = any>(url: string, script: string, opts?: any) => Promise<any>;
}

/** When to use: `chassis.citations` — relocate and revalidate citations. */
export class CitationSurface {
  constructor(private readonly deps: CitationSurfaceDeps) {}

  public async fetchCitationHtml(url: string): Promise<{
    html: string;
    status: number;
    via: 'static' | 'render';
    error?: string;
  }> {
    let html = '';
    let status = 0;
    let via: 'static' | 'render' = 'render';

    if (this.deps.researchSettings.preferStatic) {
      try {
        const outcome = await fetchStatic(url);
        if (outcome.kind === 'ok' && outcome.result.status < 400) {
          html = outcome.result.body;
          status = outcome.result.status;
          via = 'static';
        }
      } catch {
        /* fall through to render */
      }
    }

    if (!html) {
      const rendered = await this.deps.loadDetached<string>(
        url,
        'document.documentElement.outerHTML',
        { timeoutMs: 25_000, settleMs: 400 },
      );
      html = typeof rendered.result === 'string' ? rendered.result : '';
      status = rendered.status;
      via = 'render';
    }

    if (!html) return { html: '', status, via, error: 'could not read the page' };

    // Judge the challenge on visible text: raw HTML contains scripts/meta that can trip a marker.
    const visible = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    if (looksLikeChallenge(status, visible)) {
      return { html: '', status, via, error: 'challenge page' };
    }

    return { html, status, via };
  }

  /** Revalidate a stored citation anchor against the page's current markup. */
  public async relocateCitation(opts: {
    url: string;
    fingerprint: unknown;
    threshold?: number;
  }): Promise<CitationRelocation> {
    if (!opts?.url || typeof opts.url !== 'string') {
      throw this.deps.researchError('BAD_REQUEST', 'relocate_citation needs a url.');
    }
    if (!opts.fingerprint || typeof opts.fingerprint !== 'object') {
      throw this.deps.researchError('BAD_REQUEST', 'relocate_citation needs a fingerprint object.');
    }

    const fetched = await this.fetchCitationHtml(opts.url);
    if (fetched.error) {
      return {
        found: false,
        score: null,
        path: null,
        text: null,
        candidates: [],
        via: fetched.via,
        error: fetched.error,
      };
    }

    const result = await relocateAgainstHtml(fetched.html, opts.fingerprint as any, opts.threshold ?? 40);
    return { ...result, via: fetched.via };
  }

  /** Revalidate every stored anchor for one URL (or the most recent URLs). */
  public async revalidateStored(opts: { url?: string; maxUrls?: number } = {}): Promise<{
    urls: number;
    checked: number;
    found: number;
    missing: number;
    results: Array<{ url: string; checked: number; found: number; error?: string }>;
  }> {
    const urls = opts.url
      ? [opts.url]
      // Each URL is fetched sequentially with a 25s limit. Keep a single call bounded so an agent
      // cannot pin the bridge for hours by asking for every stored URL at once.
      : this.deps.anchorStore.urls().slice(0, Math.min(25, Math.max(1, Number(opts.maxUrls) || 5)));

    let checked = 0;
    let found = 0;
    const results: Array<{ url: string; checked: number; found: number; error?: string }> = [];

    for (const url of urls) {
      const records = this.deps.anchorStore.list(url);
      if (records.length === 0) continue;

      const fetched = await this.fetchCitationHtml(url);
      if (fetched.error) {
        results.push({ url, checked: 0, found: 0, error: fetched.error });
        continue;
      }

      const relocations = await relocateMany(
        fetched.html,
        records.map((record: any) => record.fingerprint),
        40,
      );
      this.deps.anchorStore.applyChecks(url, relocations);

      const urlFound = relocations.filter((result) => result.found).length;
      checked += relocations.length;
      found += urlFound;
      results.push({ url, checked: relocations.length, found: urlFound });
    }

    return { urls: results.length, checked, found, missing: checked - found, results };
  }

  /**
   * Human hand-off for a challenged page.
   *
   * Research renders in `persist:hypagon-research`; solving the challenge in a normal browsing tab
   * would populate a different cookie jar. This temporarily attaches the shared research util view
   * to the window so the human solves it in the same session, then harvests that live view.
   */
}
