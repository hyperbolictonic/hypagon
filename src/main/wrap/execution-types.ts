/**
 * The shapes the wrap executor shares across its phases.
 *
 * `execute` is split into prepare → fetch pages → compose, and each phase lives in its own
 * module; these are the values they pass to each other. Kept apart so those modules do not
 * have to import the executor (and so no cycle forms).
 */
import type { Recipe, RenderMeta, RenderedDocument } from '../../../packages/recipe/src/index.ts';
import type { WrapFormat } from './types.ts';

/** One rendered document handed to an opt-in indexer (Cortex). */
export interface WrapIndexDocument {
  title: string;
  markdown: string;
}

/** When to use: passing wrapper index metadata into a run (ids, host allowlist). */
export interface WrapIndexContext {
  wrapperId: string;
  wrapperName: string;
  /** The URL the content came from (the first page of a paginated run). */
  url: string;
}

/** When to use: the executor's per-call options after the public API normalises them. */
export interface ExecuteOptions {
  dryRun: boolean;
  includeRaw: boolean;
  format: WrapFormat;
  /** Per-call override of the executor's page cap. */
  maxPages?: number;
}

/** One fetched page, with the body already read and capped. */
export interface FetchedResponse {
  response: Response;
  url: string;
  text: string;
  bytes: number;
  truncated: boolean;
  durationMs: number;
  contentType: string;
}

/** What the recipe produced for one payload (or several merged pages). */
export interface Rendered {
  markdown: string;
  records: Record<string, unknown>[];
  documents?: RenderedDocument[];
  meta?: RenderMeta;
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

/** Overall item cap when a recipe does not declare `limits.maxItems` (mirrors the renderer). */
export const DEFAULT_MAX_ITEMS = 50;
/** Page size when a paginated recipe does not declare `pagination.pageSize`. */
export const DEFAULT_PAGE_SIZE = 50;
/** Safety cap on how many rendered documents one run may index. */
export const MAX_INDEX_DOCUMENTS = 50;

/** A recipe selection resolved to a list, or null when it is not a list. */
export type SelectedItems = unknown[] | null;

/** When to use: the recipe that a selection is read from (the wrapper's `response`). */
export type SelectionRecipe = Recipe | undefined;
