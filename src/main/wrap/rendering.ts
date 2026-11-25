/** Response rendering shared by the executor and its paging helpers. */
import { renderPayload } from './render.ts';
import type { RenderMeta, RenderedDocument } from '../../../packages/recipe/src/index.ts';
import type { WrapWrapper } from './types.ts';

/** The markdown, records and documents a recipe produced for one or more pages. */
export interface Rendered {
  markdown: string;
  records: Record<string, unknown>[];
  documents?: RenderedDocument[];
  meta?: RenderMeta;
}

/** Render one page (or a merged selection) through the wrapper's recipe. */
export function renderWrapped(
  wrapper: WrapWrapper,
  json: unknown,
  text: string,
  contentType: string,
  maxChars: number,
  maxItems?: number,
): Rendered {
  return renderPayload(wrapper, json, text, contentType, { maxChars, maxItems });
}
