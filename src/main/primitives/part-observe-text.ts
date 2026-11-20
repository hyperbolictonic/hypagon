/**
 * Primitives part: observe-text.
 */
import type { ObserveOptions } from './types.js';
import { PrimitivesExtract } from './part-extract.js';

/** When to use: the observe-text part of the primitives chain, composed into the public class. */
export class PrimitivesObserveText extends PrimitivesExtract {

  protected pageText(
    as: string,
    revision: number,
    info: { url: string; title: string },
    text: string,
    opts: ObserveOptions,
    extra: Record<string, any> = {},
    defaultBudget = 0
  ) {
    const total = text.length;
    // An explicit budget of 0 means "everything"; an omitted budget uses the
    // projection's default view (markdown is capped so a 400k-char page does not
    // land in context unasked — and, unlike before, the remainder is pageable).
    const budget = opts.budget === undefined || opts.budget === null
      ? defaultBudget
      : opts.budget > 0
        ? opts.budget
        : 0;
    let offset = 0;
    if (opts.cursor !== undefined && opts.cursor !== null && opts.cursor !== '') {
      const n = typeof opts.cursor === 'number' ? opts.cursor : parseInt(String(opts.cursor), 10);
      if (!isNaN(n) && n > 0) offset = Math.min(n, total);
    }
    let slice = text;
    let nextCursor: string | null = null;
    let truncated = false;
    if (budget > 0 && offset + budget < total) {
      let end = offset + budget;
      const nl = text.indexOf('\n', end);
      if (nl !== -1 && nl - end < budget) end = nl;
      slice = text.slice(offset, end);
      nextCursor = String(end);
      truncated = true;
    } else if (offset > 0) {
      slice = text.slice(offset);
    }
    return {
      as,
      revision,
      url: info.url,
      title: info.title,
      text: slice,
      total,
      offset,
      next_cursor: nextCursor,
      truncated,
      ...extra,
    };
  }
}
