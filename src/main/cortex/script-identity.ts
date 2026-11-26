/**
 * Stable script identity.
 *
 * A script's id must survive a save and must be distinct for two names that only differ in
 * punctuation ("sale alert" vs "sale-alert"). The old slug alone collapsed those into one id,
 * which let a delete or an update reach the wrong row. Kept free of imports so the unit test can
 * run under plain `node --test`.
 */

/** A short deterministic hash of the exact name (djb2, the same shape as the component signature). */
function nameHash(name: string): string {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) + hash + name.charCodeAt(i)) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

/** When to use: saving a script — the id derived from its exact, trimmed name. */
export function scriptId(name: string): string {
  const slug = name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  return `script_${slug}_${nameHash(name)}`;
}

/** Lowercase the host, drop a scheme/path/port and a leading `www.`; `*` and empty stay as-is. */
function normalizeDomain(value: string): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === '*') return raw;
  return raw
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/^www\./, '');
}

/**
 * When to use: `list_scripts`/recall — whether a stored domain covers the requested one.
 * Matches on host boundaries in both directions, so `example.com` covers `docs.example.com`
 * but never `notexample.com` or `example.com.evil`. `*` and a missing domain match everything.
 */
export function domainMatches(stored: string, requested: string): boolean {
  const host = normalizeDomain(stored);
  const target = normalizeDomain(requested);
  if (!host || !target || host === '*' || target === '*') return true;
  return host === target || host.endsWith(`.${target}`) || target.endsWith(`.${host}`);
}
