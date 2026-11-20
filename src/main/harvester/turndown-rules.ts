/**
 * The markdown rules that make a harvested page readable to an agent.
 *
 * Links keep clean syntax and are made absolute, images keep their alt text, and
 * controls render with stable labelled attributes instead of raw HTML that reads
 * like a stray quoted string. `[#ID]` badges survive so a mark can be acted on.
 *
 * When to use: constructing the harvester — one call installs every rule on its
 * Turndown service. URL resolution stays with the harvester (it knows the page URL).
 */

import type TurndownService from 'turndown';

/** When to use: installing the link, image, button and control rules on a harvest's converter. */
export function installMarkdownRules(turndown: TurndownService, resolveUrl: (raw: string | null) => string): void {
  // Links keep clean syntax, with a [#ID] badge when marked. Relative hrefs are
  // made absolute so an agent can follow them without knowing the page URL.
  turndown.addRule('cleanLinks', {
    filter: 'a',
    replacement: (content, node) => {
      const element = node as HTMLAnchorElement;
      const href = resolveUrl(element.getAttribute('href'));
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
  });

  // Images are mostly noise for an agent; keep the alt text and a usable URL.
  turndown.addRule('resolvedImages', {
    filter: 'img',
    replacement: (_content, node) => {
      const img = node as HTMLImageElement;
      const alt = (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
      const src = resolveUrl(img.getAttribute('src'));
      if (!src) return alt;
      return alt ? `![${alt}](${src})` : `![](${src})`;
    },
  });

  // Annotate buttons with [#ID]
  turndown.addRule('markedButtons', {
    filter: 'button',
    replacement: (content, node) => {
      const element = node as HTMLButtonElement;
      const markId = element.getAttribute('data-mark-id');
      const text = content.trim() || element.getAttribute('aria-label') || element.getAttribute('title') || 'Button';
      return markId ? `[#${markId}] <button>${text}</button>` : `<button>${text}</button>`;
    },
  });

  // Controls render with stable, labelled attributes rather than
  // `<input type="text" "Email">` (which reads like a stray quoted string).
  turndown.addRule('markedInputs', {
    filter: ['input', 'select', 'textarea'],
    replacement: (content, node) => {
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
  });
}
