/**
 * Pagination for wrappers whose recipe declares it.
 *
 * One place decides whether a run pages at all (`pagePlan`), what the next token is, and how
 * several pages become one render. The merged path concatenates the selected lists and renders
 * once, so the agent gets one table rather than N tables with repeated headings; anything the
 * recipe cannot merge falls back to a per-page join.
 */
import { renderRecipe, resolvePath } from '../../../packages/recipe/src/index.ts';
import type { Recipe } from '../../../packages/recipe/src/index.ts';
import type { WrapWrapper } from './types.ts';
import {
  DEFAULT_PAGE_SIZE,
  MAX_INDEX_DOCUMENTS,
  type PagePlan,
  type Rendered,
  type WrapIndexDocument,
} from './execution-types.ts';

/** When to use: the paging contract derived from the recipe, or `active: false` for one request. */
export function pagePlan(wrapper: WrapWrapper, built: { url: string }): PagePlan {
  const spec = wrapper.response?.pagination;
  const type = (spec?.type ?? 'none') as PagePlan['type'];
  const active = type !== 'none' && !!wrapper.response;

  let pageSize = spec?.pageSize ?? 0;
  if (active && spec?.limitParam && !pageSize) {
    try {
      const current = Number(new URL(built.url).searchParams.get(spec.limitParam));
      if (Number.isFinite(current) && current > 0) pageSize = Math.floor(current);
    } catch {
      /* keep the default */
    }
  }

  return {
    active,
    type,
    pageSize: pageSize || DEFAULT_PAGE_SIZE,
    limitParam: spec?.limitParam,
    offsetParam: spec?.offsetParam,
    cursorParam: spec?.cursorParam,
    nextPath: spec?.next,
    hasMorePath: spec?.hasMore,
    nextUrlPath: spec?.nextUrl,
  };
}

/** When to use: reading the list a recipe selects from one page (null when not a list). */
export function itemsOf(recipe: Recipe | undefined, page: unknown): unknown[] | null {
  if (!recipe?.select) return null;
  const value = resolvePath(page, recipe.select);
  return Array.isArray(value) ? value : null;
}

/**
 * When to use: deciding whether another page exists and what to send next.
 * `true` for offset paging, the cursor/next-URL string for cursor/link paging.
 */
export function nextPageToken(plan: PagePlan, page: unknown, pageCount: number): string | true | null {
  if (plan.type === 'offset') {
    if (plan.hasMorePath) {
      const more = resolvePath(page, plan.hasMorePath);
      if (more === undefined || more === null || more === false || more === 0) return null;
    }
    return pageCount >= plan.pageSize ? true : null;
  }
  if (plan.type === 'cursor') {
    const next = plan.nextPath ? resolvePath(page, plan.nextPath) : undefined;
    return next === undefined || next === null || next === '' ? null : String(next);
  }
  if (plan.type === 'link') {
    const next = plan.nextUrlPath ? resolvePath(page, plan.nextUrlPath) : undefined;
    return next === undefined || next === null || next === '' ? null : String(next);
  }
  return null;
}

/** When to use: concatenating the selected list of every page (null when any page is not a list). */
export function mergeSelection(recipe: Recipe | undefined, rawPages: unknown[]): unknown[] | null {
  if (!recipe?.select) return null;
  const out: unknown[] = [];
  for (const page of rawPages) {
    const value = resolvePath(page, recipe.select);
    if (!Array.isArray(value)) return null;
    out.push(...value);
  }
  return out;
}

/**
 * When to use: merging several pages into one render.
 *
 * The common case (a `select` that resolves to a list) concatenates the lists and renders
 * once; otherwise the pages are rendered separately and joined with a rule.
 */
export function mergePages(input: {
  wrapper: WrapWrapper;
  rawPages: unknown[];
  itemCap: number;
  maxResultChars: number;
  render: (wrapper: WrapWrapper, json: unknown, text: string, contentType: string, maxItems?: number) => Rendered;
}): Rendered {
  const recipe = input.wrapper.response;
  const merged = mergeSelection(recipe, input.rawPages);

  if (merged && merged.length > 0) {
    try {
      const result = renderRecipe(
        { __kuang_pages: merged },
        { ...(recipe as Recipe), select: '$.__kuang_pages' },
        { maxChars: input.maxResultChars, maxItems: input.itemCap },
      );
      return {
        markdown: result.markdown,
        records: result.records,
        documents: result.documents,
        meta: result.meta,
      };
    } catch {
      /* fall through to the per-page join */
    }
  }

  const parts = input.rawPages.map((page) => input.render(input.wrapper, page, '', '', input.itemCap));
  const markdown = parts.map((part) => part.markdown).filter(Boolean).join('\n\n---\n\n');
  const records = parts.flatMap((part) => part.records).slice(0, input.itemCap);
  const documents = parts.flatMap((part) => part.documents ?? []);
  const selected = parts.reduce((total, part) => total + (part.meta?.selected ?? 0), 0);
  return {
    markdown,
    records,
    documents,
    meta: {
      mode: parts[0]?.meta?.mode ?? 'table',
      select: parts[0]?.meta?.select ?? '$',
      selected,
      rendered: records.length,
      truncated: selected > records.length,
      chars: markdown.length,
    },
  };
}

/**
 * When to use: deciding what an opt-in indexer receives — one entry per rendered document when
 * the recipe used documents mode, otherwise one entry for the whole result, capped.
 */
export function documentsToIndex(wrapper: WrapWrapper, rendered: Rendered): WrapIndexDocument[] {
  const documents = (rendered.documents ?? [])
    .filter((document) => document.markdown && document.markdown.trim())
    .map((document) => ({ title: document.title || wrapper.name, markdown: document.markdown }));

  if (documents.length > 0) return documents.slice(0, MAX_INDEX_DOCUMENTS);

  const markdown = rendered.markdown?.trim();
  if (!markdown) return [];
  return [{ title: wrapper.response?.name || wrapper.name, markdown }].slice(0, MAX_INDEX_DOCUMENTS);
}
