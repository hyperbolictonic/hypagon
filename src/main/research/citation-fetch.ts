/**
 * Reading a page for citation work, following the research tier policy: the static
 * impersonating fetch first, then the detached render, with the challenge judged on
 * visible text.
 *
 * Why a module: the tiers and the "is this a challenge page" judgement are one
 * policy, shared by relocate and revalidate.
 */
import { fetchStatic } from '../network/impersonate.js';
import { looksLikeChallenge, type ResearchSettings } from './settings.js';
import type { DetachedViewController } from './detached-view.js';

/** What one citation fetch produced. */
export interface CitationFetch {
  html: string;
  status: number;
  via: 'static' | 'render';
  error?: string;
}

/** When to use: `CitationController` — the settings and the shared research view. */
export interface CitationFetcherDeps {
  researchSettings: () => ResearchSettings;
  detachedView: DetachedViewController;
}

/** When to use: `CitationController` — one fetcher per controller. */
export class CitationFetcher {
  private readonly deps: CitationFetcherDeps;

  constructor(deps: CitationFetcherDeps) {
    this.deps = deps;
  }

  /** Fetch a URL for citation work; a challenge page comes back as an error, not markup. */
  async fetch(url: string): Promise<CitationFetch> {
    let html = '';
    let status = 0;
    let via: 'static' | 'render' = 'render';

    if (this.deps.researchSettings().preferStatic) {
      try {
        const outcome = await fetchStatic(url);
        if (outcome.kind === 'ok' && outcome.result.status < 400) {
          html = outcome.result.body;
          status = outcome.result.status;
          via = 'static';
        }
      } catch {
        // Fall through to the render tier.
      }
    }

    if (!html) {
      const rendered = await this.deps.detachedView.load<string>(url, 'document.documentElement.outerHTML', {
        timeoutMs: 25_000,
        settleMs: 400,
      });
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
}
