import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { HarvestedConstruct } from '../../shared/types.js';
import { installMarkdownRules } from './turndown-rules.js';

/** When to use: reporting harvest counts (links, words, tokens). */
export interface HarvestStats {
  /** Open shadow roots inlined by the composed-DOM serialiser (0 = none). */
  shadowRoots?: number;
}

/**
 * Hard safety cap. The previous 25k cut silently destroyed everything past
 * it — the `budget`/`next_cursor` paging in `observe` could not reach it,
 * because the text had already been thrown away. Paging now happens in
 * `pageText`; this cap only guards against pathological pages (infinite
 * scroll, giant data tables) producing megabyte constructs.
 */
const MAX_CONSTRUCT_CHARS = 200_000;

/** When to use: turning a rendered page into markdown plus marks. */
export class ConstructHarvester {
  private turndown: TurndownService;
  private baseUrl = '';

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_',
    });

    // Strip unhelpful noise tags
    this.turndown.remove(['script', 'style', 'noscript', 'iframe', 'canvas', 'svg'] as any);

    installMarkdownRules(this.turndown, (raw) => this.resolveUrl(raw));
  }

  /** Resolve a possibly-relative URL against the page being harvested. */
  private resolveUrl(raw: string | null): string {
    if (!raw) return '';
    const href = raw.trim();
    if (!href) return '';
    if (href.startsWith('javascript:') || href.startsWith('#')) return href;
    try {
      return new URL(href, this.baseUrl || undefined).toString();
    } catch {
      return href;
    }
  }

  /**
   * Downsamples raw active DOM HTML into an ultra-clean, token-efficient
   * Markdown construct with a minimal front-matter envelope.
   *
   * `rawHtml` should be the *composed* DOM (see dom-serializer.ts) so web
   * components are visible; `stats.shadowRoots` is reported honestly so a
   * reader can tell whether the page was pierced or simply had none.
   */
  public harvest(rawHtml: string, currentUrl: string, fallbackTitle?: string, stats: HarvestStats = {}): HarvestedConstruct {
    const extracted = this.extract(rawHtml, currentUrl, fallbackTitle);

    // Downsample HTML to clean GFM Markdown
    const rawMarkdown = this.turndown.turndown(extracted.htmlToConvert);
    // Clean multiple consecutive blank lines
    let body = rawMarkdown.replace(/\n{3,}/g, '\n\n').trim();
    body = withCompletenessNotes(body, extracted.extractedChars, extracted.pageChars);

    // Title heading: only when the extracted body does not already open with one.
    const bodyHasHeading = /^#\s/.test(body);
    const content = bodyHasHeading ? body : `# ${extracted.title}\n\n${body}`;

    const envelope = buildEnvelope({
      url: currentUrl,
      ...extracted,
      content,
      ...(stats.shadowRoots ? { shadowRoots: Number(stats.shadowRoots) } : {}),
    });

    return {
      url: currentUrl,
      title: extracted.title,
      timestamp: new Date().toISOString(),
      rawHtmlLength: rawHtml.length,
      markdownLength: envelope.length,
      estimatedTokens: Math.ceil(envelope.length / 4),
      extractedChars: extracted.extractedChars,
      pageChars: extracted.pageChars,
      reader: extracted.usedReadability ? 'readability' : 'full-body',
      shadowRoots: Number(stats.shadowRoots) || 0,
      content: envelope,
    };
  }

  /**
   * Picks the region to convert and measures it.
   *
   * Snapshots the cleaned body BEFORE Readability runs — `parse()` mutates the
   * document in place, so reading it afterwards already lost the content that the
   * full-body fallback is meant to keep.
   */
  private extract(rawHtml: string, currentUrl: string, fallbackTitle?: string) {
    this.baseUrl = currentUrl;

    const dom = new JSDOM(rawHtml, { url: currentUrl });
    const doc = dom.window.document;

    // Strip heavy non-content tags before reading/parsing
    const tagsToRemove = ['script', 'style', 'svg', 'noscript', 'iframe', 'canvas', 'template'];
    tagsToRemove.forEach((tag) => {
      doc.querySelectorAll(tag).forEach((el) => el.remove());
    });

    const cleanedBodyHtml = doc.body?.innerHTML || rawHtml;
    const bodyTextLen = doc.body?.textContent?.trim().length || 0;

    // Use Mozilla Readability to isolate article content and strip sidebars/ads
    const parsed = new Readability(doc).parse();

    const title = parsed?.title || doc.title || fallbackTitle || 'Untitled Matrix Node';

    // Detect if Readability over-pruned an aggregator/portal page (e.g. Google News,
    // Skyscanner, search listings).
    const readabilityTextLen = parsed?.textContent?.trim().length || 0;
    const isAggregatorOrPortal = readabilityTextLen < 250 || (bodyTextLen > 600 && readabilityTextLen < bodyTextLen * 0.35);

    const usedReadability = !isAggregatorOrPortal && Boolean(parsed?.content);
    const htmlToConvert = usedReadability ? (parsed!.content as string) : cleanedBodyHtml;

    return {
      title,
      htmlToConvert,
      usedReadability,
      pageChars: bodyTextLen,
      // Text that was actually in the extracted region — the same unit as
      // page_chars, so the two can honestly be compared (markdown syntax would
      // make a character count of the output larger than the page's own text).
      extractedChars: usedReadability ? readabilityTextLen : bodyTextLen,
    };
  }
}

/**
 * States what the markdown is missing, when anything is.
 *
 * An empty body and a partially visible one are different claims; both are said
 * plainly instead of letting a short document imply a short page.
 */
function withCompletenessNotes(body: string, extractedChars: number, pageChars: number): string {
  if (!body) {
    return pageChars > 200
      ? `_(no readable content — the page has ${pageChars} characters of text but none converted)_`
      : '_(no text content on this page — it may be a canvas/WebGL app, still loading, or an empty dialog. Try observe(as:"ax") or take_screenshot.)_';
  }

  let noted = body;
  if (extractedChars > 0 && pageChars > 1500 && extractedChars < pageChars * 0.15 && pageChars - extractedChars > 2000) {
    // Be explicit about partial visibility instead of pretending the page is short.
    noted +=
      `\n\n> Partial view: the extracted region holds ${extractedChars.toLocaleString('en-US')} of the page's ${pageChars.toLocaleString('en-US')} characters. ` +
      `The rest sits outside it — closed shadow roots, a canvas, a cross-origin iframe, or a collapsed panel. ` +
      `Try observe(as:"text") for raw innerText, or observe(as:"ax").`;
  }

  if (noted.length > MAX_CONSTRUCT_CHARS) {
    noted = noted.slice(0, MAX_CONSTRUCT_CHARS) + '\n\n> [construct truncated at 200,000 characters — the safety cap]';
  }

  return noted;
}

/**
 * Minimal, stable front matter. Everything here is either needed to interpret the
 * body or a statement about how complete it is. Deliberately no timestamp (it makes
 * two harvests of one page non-identical) and no byte-ratio vanity metric.
 */
function buildEnvelope(input: {
  url: string;
  title: string;
  content: string;
  usedReadability: boolean;
  extractedChars: number;
  pageChars: number;
  shadowRoots?: number;
}): string {
  return [
    '---',
    `url: "${input.url.replace(/"/g, '\\"')}"`,
    `title: "${input.title.replace(/"/g, '\\"')}"`,
    `reader: "${input.usedReadability ? 'readability' : 'full-body'}"`,
    `extracted_chars: ${input.extractedChars}`,
    `page_chars: ${input.pageChars}`,
    ...(input.shadowRoots ? [`shadow_roots: ${input.shadowRoots}`] : []),
    '---',
    '',
    input.content,
  ].join('\n');
}
