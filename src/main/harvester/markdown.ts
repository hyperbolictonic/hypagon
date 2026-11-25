import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import type { HarvestedConstruct } from '../../shared/types.js';

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

/** Resolve a possibly-relative URL against the page being harvested. */
type ResolveUrl = (raw: string | null) => string;

/**
 * Links keep clean syntax, with a [#ID] badge when marked. Relative hrefs are
 * made absolute so an agent can follow them without knowing the page URL.
 */
function linkRule(resolve: ResolveUrl): TurndownService.Rule {
  return {
    filter: 'a',
    replacement: (content: string, node: any) => {
      const element = node as HTMLAnchorElement;
      const href = resolve(element.getAttribute('href'));
      const markId = element.getAttribute('data-mark-id');
      const markPrefix = markId ? `[#${markId}] ` : '';
      // Card anchors (e.g. Skyscanner fare rows) often carry their entire label in
      // aria-label/title with no text node; fall back to those so the content survives.
      const text = content.trim() || element.getAttribute('aria-label') || element.getAttribute('title') || '';
      if (!href || href.startsWith('javascript:') || !text) {
        return markPrefix + text;
      }
      return `${markPrefix}[${text}](${href})`;
    },
  };
}

/** Images are mostly noise for an agent; keep the alt text and a usable URL. */
function imageRule(resolve: ResolveUrl): TurndownService.Rule {
  return {
    filter: 'img',
    replacement: (_content: string, node: any) => {
      const img = node as HTMLImageElement;
      const alt = (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
      const src = resolve(img.getAttribute('src'));
      if (!src) return alt;
      return alt ? `![${alt}](${src})` : `![](${src})`;
    },
  };
}

/** Buttons render as a labelled tag with a [#ID] badge when marked. */
function buttonRule(): TurndownService.Rule {
  return {
    filter: 'button',
    replacement: (content: string, node: any) => {
      const element = node as HTMLButtonElement;
      const markId = element.getAttribute('data-mark-id');
      const text = content.trim() || element.getAttribute('aria-label') || element.getAttribute('title') || 'Button';
      return markId ? `[#${markId}] <button>${text}</button>` : `<button>${text}</button>`;
    },
  };
}

/**
 * Controls render with stable, labelled attributes rather than
 * `<input type="text" "Email">` (which reads like a stray quoted string).
 */
function inputRule(): TurndownService.Rule {
  return {
    filter: ['input', 'select', 'textarea'] as Array<keyof HTMLElementTagNameMap>,
    replacement: (content: string, node: any) => {
      const element = node as HTMLInputElement;
      const markId = element.getAttribute('data-mark-id');
      const tag = element.tagName.toLowerCase();
      const prefix = markId ? `[#${markId}] ` : '';
      const label =
        element.getAttribute('aria-label') ||
        element.getAttribute('placeholder') ||
        element.getAttribute('name') ||
        element.getAttribute('autocomplete') ||
        '';
      const labelStr = label ? ` label="${label}"` : '';

      if (tag === 'select') {
        // Turndown parses with domino, which does not implement `select.value`
        // or `selectedOptions`, so read the serialised attributes instead.
        const options = Array.from((element as unknown as HTMLSelectElement).options || []).map(
          (o) => o.getAttribute('value') || o.textContent || '',
        );
        const chosen = Array.from((element as unknown as HTMLSelectElement).options || []).find((o) =>
          o.hasAttribute('selected'),
        );
        const value = chosen ? chosen.getAttribute('value') || chosen.textContent || '' : '';
        const valueStr = value ? ` value="${value}"` : '';
        const optsStr = options.length ? ` options="${options.slice(0, 15).join(',')}"` : '';
        return `${prefix}<select${labelStr}${valueStr}${optsStr}>`;
      }

      if (tag === 'textarea') {
        const value = content.trim() || (element as unknown as HTMLTextAreaElement).textContent || '';
        return `${prefix}<textarea${labelStr}>${value}</textarea>`;
      }

      const type = (element.getAttribute('type') || 'text').toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        const checked = element.hasAttribute('checked') ? ' checked' : '';
        return `${prefix}<input type="${type}"${labelStr}${checked}>`;
      }
      if (type === 'password') {
        const filled = element.getAttribute('data-filled');
        return `${prefix}<input type="password"${labelStr}${filled ? ` filled="${filled}"` : ''}>`;
      }
      const value = element.getAttribute('value') || '';
      const valueStr = value ? ` value="${value.replace(/"/g, '\\"')}"` : '';
      return `${prefix}<input type="${type}"${labelStr}${valueStr}>`;
    },
  };
}

/** Strip heavy non-content tags before reading/parsing. */
function stripNoise(doc: Document): void {
  const tagsToRemove = ['script', 'style', 'svg', 'noscript', 'iframe', 'canvas', 'template'];
  tagsToRemove.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  });
}

interface SelectedContent {
  title: string;
  htmlToConvert: string;
  usedReadability: boolean;
  readabilityTextLen: number;
  bodyTextLen: number;
}

/**
 * Pick the region to convert: Readability's article when it found one, the cleaned
 * body when it over-pruned an aggregator/portal page.
 */
function selectContent(doc: Document, rawHtml: string, fallbackTitle?: string): SelectedContent {
  // Snapshot the cleaned body BEFORE Readability runs. `Readability.parse()` mutates the
  // JSDOM document in place, so reading `doc.body.innerHTML` *after* it returns already-pruned
  // content. That silently deleted virtualized list/card results (e.g. Skyscanner fare cards)
  // on aggregator pages, where the fallback below is meant to keep the full body.
  const cleanedBodyHtml = doc.body?.innerHTML || rawHtml;
  const bodyTextLen = doc.body?.textContent?.trim().length || 0;

  // Use Mozilla Readability to isolate article content and strip sidebars/ads
  const parsed = new Readability(doc).parse();
  const title = parsed?.title || doc.title || fallbackTitle || 'Untitled Matrix Node';

  // Detect if Readability over-pruned an aggregator/portal page (e.g. Google News, Skyscanner, search listings)
  const readabilityTextLen = parsed?.textContent?.trim().length || 0;
  const isAggregatorOrPortal = readabilityTextLen < 250 || (bodyTextLen > 600 && readabilityTextLen < bodyTextLen * 0.35);

  const usedReadability = !isAggregatorOrPortal && Boolean(parsed?.content);
  return {
    title,
    htmlToConvert: usedReadability ? (parsed!.content as string) : cleanedBodyHtml,
    usedReadability,
    readabilityTextLen,
    bodyTextLen,
  };
}

/** Be explicit about partial visibility instead of pretending the page is short. */
function partialViewNote(extractedChars: number, pageChars: number): string {
  return (
    `\n\n> Partial view: the extracted region holds ${extractedChars.toLocaleString('en-US')} of the page's ${pageChars.toLocaleString('en-US')} characters. ` +
    `The rest sits outside it — closed shadow roots, a canvas, a cross-origin iframe, or a collapsed panel. ` +
    `Try observe(as:"text") for raw innerText, or observe(as:"ax").`
  );
}

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

    const resolve: ResolveUrl = (raw) => this.resolveUrl(raw);
    this.turndown.addRule('cleanLinks', linkRule(resolve));
    this.turndown.addRule('resolvedImages', imageRule(resolve));
    this.turndown.addRule('markedButtons', buttonRule());
    this.turndown.addRule('markedInputs', inputRule());
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
    this.baseUrl = currentUrl;

    const dom = new JSDOM(rawHtml, { url: currentUrl });
    const doc = dom.window.document;
    stripNoise(doc);

    const selected = selectContent(doc, rawHtml, fallbackTitle);
    const { title, htmlToConvert, usedReadability, readabilityTextLen, bodyTextLen } = selected;

    // Downsample HTML to clean GFM Markdown
    const rawMarkdown = this.turndown.turndown(htmlToConvert);

    // Clean multiple consecutive blank lines
    let body = rawMarkdown.replace(/\n{3,}/g, '\n\n').trim();

    const pageChars = bodyTextLen;
    // Text that was actually in the extracted region — the same unit as
    // page_chars, so the two can honestly be compared (markdown syntax would
    // make a character count of the output larger than the page's own text).
    const extractedChars = usedReadability ? readabilityTextLen : bodyTextLen;

    if (!body) {
      body = pageChars > 200
        ? `_(no readable content — the page has ${pageChars} characters of text but none converted)_`
        : '_(no text content on this page — it may be a canvas/WebGL app, still loading, or an empty dialog. Try observe(as:"ax") or take_screenshot.)_';
    } else if (extractedChars > 0 && pageChars > 1500 && extractedChars < pageChars * 0.15 && pageChars - extractedChars > 2000) {
      body += partialViewNote(extractedChars, pageChars);
    }

    if (body.length > MAX_CONSTRUCT_CHARS) {
      body = body.slice(0, MAX_CONSTRUCT_CHARS) + '\n\n> [construct truncated at 200,000 characters — the safety cap]';
    }

    // Title heading: only when the extracted body does not already open with one.
    const bodyHasHeading = /^#\s/.test(body);
    const content = bodyHasHeading ? body : `# ${title}\n\n${body}`;

    // Minimal, stable envelope. Everything here is either needed to interpret
    // the body or a statement about how complete it is. Deliberately no
    // timestamp (it makes two harvests of one page non-identical) and no
    // byte-ratio vanity metric.
    const envelope = [
      '---',
      `url: "${currentUrl.replace(/"/g, '\\"')}"`,
      `title: "${title.replace(/"/g, '\\"')}"`,
      `reader: "${usedReadability ? 'readability' : 'full-body'}"`,
      `extracted_chars: ${extractedChars}`,
      `page_chars: ${pageChars}`,
      ...(stats.shadowRoots ? [`shadow_roots: ${stats.shadowRoots}`] : []),
      '---',
      '',
      content,
    ].join('\n');

    const estimatedTokens = Math.ceil(envelope.length / 4);

    return {
      url: currentUrl,
      title,
      timestamp: new Date().toISOString(),
      rawHtmlLength: rawHtml.length,
      markdownLength: envelope.length,
      estimatedTokens,
      extractedChars,
      pageChars,
      reader: usedReadability ? 'readability' : 'full-body',
      shadowRoots: Number(stats.shadowRoots) || 0,
      content: envelope,
    };
  }
}
