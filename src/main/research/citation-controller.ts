/**
 * Citations and the human hand-off: anchor capture and revalidation, plus the
 * "a person solves the challenge" path for research pages.
 *
 * Why this file is small: `citation-fetch.ts` owns the tier policy (static fetch,
 * then detached render, with the challenge judged on visible text);
 * `citation-anchors.ts` owns the anchor store, the warm-origin set and
 * revalidation; `handoff.ts` owns the attach → wait-for-human → harvest flow, with
 * its page probe in `handoff-probe.ts`. This class keeps the API the chassis and
 * the crawler config call.
 *
 * The hand-off renders research pages in the detached research view (its own
 * cookie jar), attaches it to the window so a human can solve the challenge in
 * the same session, and harvests that live view.
 */
import { relocateCitation as relocateAgainstHtml } from './anchors.js';
import { CitationAnchors, type RevalidationSummary } from './citation-anchors.js';
import { CitationFetcher } from './citation-fetch.js';
import { HumanHandoff, type HandoffEnvironment, type HumanHandoffResult } from './handoff.js';
import { researchError } from './session-controller.js';
import type { CitationAnchor, CitationRelocation } from './anchors.js';
import type { HumanAssistInfo } from '../crawl/crawler.js';
import type { BrowserWindow, WebContents } from 'electron';
import type { ResearchSettings } from './settings.js';
import type { HilManager } from '../hil/hil-manager.js';
import type { DetachedViewController } from './detached-view.js';

export type { RevalidationSummary } from './citation-anchors.js';
export type { HumanHandoffResult } from './handoff.js';

/** When to use: building the chassis — everything the citation pipeline reads through. */
export interface CitationControllerDeps extends HandoffEnvironment {}

/** When to use: the chassis — own the anchors, the hand-off and the fetch policy. */
export class CitationController {
  /** The tier policy for reading a cited page. */
  readonly fetcher: CitationFetcher;
  /** The anchor store, the warm origins and revalidation. */
  readonly anchors: CitationAnchors;
  /** The human hand-off for a challenged page. */
  readonly handoff: HumanHandoff;

  constructor(deps: CitationControllerDeps) {
    this.fetcher = new CitationFetcher({
      researchSettings: deps.researchSettings,
      detachedView: deps.detachedView,
    });
    this.anchors = new CitationAnchors(this.fetcher);
    this.handoff = new HumanHandoff({
      window: deps.window,
      detachedView: deps.detachedView,
      hilManager: deps.hilManager,
      researchSettings: deps.researchSettings,
      viewportBounds: deps.viewportBounds,
      reassertViewport: deps.reassertViewport,
      activeWebContents: deps.activeWebContents,
      log: deps.log,
      anchorFromHtml: (url, html, anchorsFor) => this.anchors.fromHtml(url, html, anchorsFor),
      warmOrigin: (url) => this.anchors.warmOrigin(url),
    });
  }

  /** Why the last hand-off was skipped, for the WAF error message. */
  get skipReason(): string | null {
    return this.handoff.skipReason;
  }

  /** True when a human authenticated this origin in the real browser this session. */
  originIsWarm(url: string): boolean {
    return this.anchors.originIsWarm(url);
  }

  /** Record that a human cleared this origin in the real browser. */
  warmOrigin(url: string): void {
    this.anchors.warmOrigin(url);
  }

  /** Fingerprint the blocks behind matching highlights and store them for revalidation. */
  async anchorFromHtml(
    url: string,
    html: string | undefined | null,
    anchorsFor: string,
  ): Promise<CitationAnchor[] | undefined> {
    return this.anchors.fromHtml(url, html, anchorsFor);
  }

  /** Revalidate a stored citation anchor against the page's current markup. */
  async relocateCitation(opts: { url: string; fingerprint: unknown; threshold?: number }): Promise<CitationRelocation> {
    if (!opts?.url || typeof opts.url !== 'string') {
      throw researchError('BAD_REQUEST', 'relocate_citation needs a url.');
    }
    if (!opts.fingerprint || typeof opts.fingerprint !== 'object') {
      throw researchError('BAD_REQUEST', 'relocate_citation needs a fingerprint object.');
    }

    const fetched = await this.fetcher.fetch(opts.url);
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
  async revalidateStored(opts: { url?: string; maxUrls?: number } = {}): Promise<RevalidationSummary> {
    return this.anchors.revalidate(opts);
  }

  /** Human hand-off for a challenged page. */
  attemptHandoff(
    url: string,
    onHuman?: (info: HumanAssistInfo) => void,
    anchorsFor?: string,
  ): Promise<HumanHandoffResult> {
    return this.handoff.attempt(url, onHuman, anchorsFor);
  }
}
