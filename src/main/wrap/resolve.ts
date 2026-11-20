/**
 * Resolve the wrapper a call targets: an inline wrapper (validated) or a stored
 * one by id.
 *
 * Why this is one module: the validation semantics and the error codes
 * (`INVALID_WRAPPER`, `WRAPPER_REQUIRED`, `WRAPPER_NOT_FOUND`) are part of the
 * tool contract. Both executor cores resolve id-or-inline before executing, and
 * a copy that drifted would make the same request fail differently depending on
 * `HB_WRAP_CORE`.
 */
import { validateWrapper } from './validate-wrapper.ts';
import type { WrapStore } from './store.ts';
import type { WrapWrapper } from './types.ts';

/** When to use: the result of resolving an id-or-inline wrapper — the wrapper, or the code and message to return. */
export interface WrapperResolution {
  wrapper?: WrapWrapper;
  code: string;
  message: string;
}

/**
 * When to use: `run` / `preview` / `test` on either executor core — resolve the
 * id-or-inline wrapper before executing, with the shared validation rules.
 */
export function resolveWrapper(
  store: WrapStore,
  id: string | undefined,
  wrapper: unknown,
): WrapperResolution {
  if (wrapper !== undefined) {
    const validation = validateWrapper(wrapper);
    if (!validation.ok || !validation.wrapper) {
      return { code: 'INVALID_WRAPPER', message: validation.errors.join('; ') };
    }
    return { wrapper: validation.wrapper, code: '', message: '' };
  }

  if (!id) return { code: 'WRAPPER_REQUIRED', message: 'Provide either id or wrapper.' };
  const stored = store.get(id);
  if (!stored) return { code: 'WRAPPER_NOT_FOUND', message: `No wrapper named "${id}".` };
  return { wrapper: stored, code: '', message: '' };
}
