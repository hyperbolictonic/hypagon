/**
 * The DOM lookup every renderer surface needs.
 *
 * Why a module: `document.getElementById(...) as T | null` was copied into the research
 * panel, the tools panel and the viewport controls (and the duplicate gate caught the
 * copy). One helper keeps the cast honest and the import short.
 */

/** When to use: resolving a control declared in index.html by its id. */
export function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
