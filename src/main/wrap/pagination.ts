/**
 * Paging contract and merged rendering for the REST executor.
 *
 * The recipe decides whether a wrapper pages and how (offset, cursor or link).
 * These helpers are pure: the executor owns fetching and secret handling.
 */
import { renderRecipe, resolvePath } from '../../../packages/recipe/src/index.ts';
import type { Recipe } from '../../../packages/recipe/src/index.ts';
import { renderWrapped, type Rendered } from './rendering.ts';
import type { WrapWrapper } from './types.ts';

/** One rendered document handed to an opt-in indexer (Cortex). */
export interface WrapIndexDocument {
  title: string;
  markdown: string;
}

/** Where an indexed document came from, for the indexer's metadata. */
export interface WrapIndexContext {
  wrapperId: string;
  wrapperName: string;
  /** The URL the content came from (the first page of a paginated run). */
  url: string;
}

/** The paging contract derived from `recipe.pagination` for one run. */
export interface PagePlan {
  active: boolean;
  type: 'none' | 'cursor' | 'offset' | 'link';
  pageSize: number;
  limitParam?: string;
  offsetParam?: string;
  cursorParam?: string;
  nextPath?: string;
  hasMorePath?: string;
  nextUrlPath?: string;
}

/** Page size when a paginated recipe does not declare `pagination.pageSize`. */
const DEFAULT_PAGE_SIZE = 50;
/** Safety cap on how many rendered documents one run may index. */
const MAX_INDEX_DOCUMENTS = 50;

/** The paging contract derived from the recipe, or `active: false` for a single request. */
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

/** The list a recipe selects from one page, or null when the selection is not a list. */
export function itemsOf(recipe: Recipe | undefined, page: unknown): unknown[] | null {
  if (!recipe?.select) return null;
  const value = resolvePath(page, recipe.select);
  return Array.isArray(value) ? value : null;
}

/**
 * Whether another page exists, and what to send next.
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

/**
 * Merge several pages into one render. The common case (a `select` that resolves to a
 * list) concatenates the lists and renders once, so the agent gets one table rather
 * than N tables with repeated headings.
 */
export function mergePages(
  wrapper: WrapWrapper,
  rawPages: unknown[],
  itemCap: number,
  maxChars: number,
): Rendered {
  const recipe = wrapper.response;
  const merged = mergeSelection(recipe, rawPages);

  if (merged && merged.length > 0) {
    try {
      const result = renderRecipe(
        { __kuang_pages: merged },
        { ...(recipe as Recipe), select: '$.__kuang_pages' },
        { maxChars, maxItems: itemCap },
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

  const parts = rawPages.map((page) => renderWrapped(wrapper, page, '', '', maxChars, itemCap));
  const markdown = parts.map((part) => part.markdown).filter(Boolean).join('\n\n---\n\n');
  const records = parts.flatMap((part) => part.records).slice(0, itemCap);
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

function mergeSelection(recipe: Recipe | undefined, rawPages: unknown[]): unknown[] | null {
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
 * What an opt-in indexer receives: one entry per rendered document when the recipe used
 * documents mode, otherwise one entry for the whole rendered result. Capped so a large
 * table cannot turn into hundreds of embeddings.
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

/** Whether two URLs share an origin. */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}
