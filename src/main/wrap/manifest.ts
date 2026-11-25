/**
 * The manifest row for one wrapper: what `wrap_list` and the Settings table show.
 *
 * Why a module: the row is a projection — the host from the URL, the mutating flag
 * derived from the methods — and it reads better on its own than inline in the store.
 */
import type { WrapManifestEntry, WrapWrapper } from './types.ts';

/** When to use: `WrapStore.manifest` — one wrapper summarised for a list. */
export function manifestOf(wrapper: WrapWrapper): WrapManifestEntry {
  let host = '';
  try {
    host = new URL(wrapper.request.url).host;
  } catch {
    host = '';
  }
  return {
    id: wrapper.id,
    name: wrapper.name,
    description: wrapper.description,
    method: wrapper.request.method,
    methods: wrapper.request.methods,
    host,
    mutating:
      wrapper.mutating ??
      (wrapper.request.methods?.length ? wrapper.request.methods : [wrapper.request.method]).some(
        (method) => !['GET', 'HEAD'].includes(method),
      ),
    required: wrapper.inputSchema?.required || [],
    exposeAsTool: Boolean(wrapper.exposeAsTool),
    secret: wrapper.request.auth,
    lastVerified: wrapper.lastVerified,
  };
}
