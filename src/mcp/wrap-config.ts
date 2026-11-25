/**
 * The wrap server's environment: where the bridge is, how to authenticate, and the two budgets.
 *
 * Why a module: the values are read once at boot from the environment, and both the bridge client
 * and the tool surface need them without importing the server.
 */

/** The Cyberdeck bridge base URL (no trailing slash). */
export const BRIDGE_URL = (process.env.HB_BRIDGE_URL || process.env.KUANG_BRIDGE_URL || 'http://127.0.0.1:4111').replace(
  /\/$/,
  '',
);

/** Ceiling on one bridge round-trip; generous for a paged wrapper run. */
export const BRIDGE_TIMEOUT_MS = (() => {
  const raw = Number(process.env.HB_WRAP_TIMEOUT_MS ?? process.env.KUANG_WRAP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 90_000;
})();

/** A file the app rotates; the MCP process only reads it. */
export const TOKEN_FILE = process.env.HB_WRAP_TOKEN_FILE || process.env.KUANG_WRAP_TOKEN_FILE || '';

/** An explicit token (tests, CI) instead of a file. */
export const STATIC_TOKEN =
  process.env.HB_WRAP_TOKEN ||
  process.env.KUANG_WRAP_TOKEN ||
  process.env.HB_BRIDGE_TOKEN ||
  process.env.KUANG_BRIDGE_TOKEN ||
  '';

/**
 * How many generated `wrap_<id>` tools may be registered at once. This is a model-context
 * budget, not an MCP limit (the protocol has no tool cap). `HB_WRAP_MAX_TOOLS=0` disables
 * generated tools entirely; the ten meta-tools keep working.
 */
export const GENERATED_TOOL_CAP = (() => {
  const raw = Number(process.env.HB_WRAP_MAX_TOOLS ?? process.env.KUANG_WRAP_MAX_TOOLS);
  if (!Number.isFinite(raw) || raw < 0) return 40;
  return Math.min(Math.floor(raw), 200);
})();

/** Names the static meta-tools own; a generated name must never collide with one. */
export const META_TOOL_NAMES: readonly string[] = [
  'wrap_list',
  'wrap_get',
  'wrap_derive',
  'wrap_secret_list',
  'wrap_create',
  'wrap_update',
  'wrap_delete',
  'wrap_run',
  'wrap_test',
  'wrap_reload',
];

/** A response longer than this is truncated with a hint to narrow it. */
export const MAX_TEXT_CHARS = 60_000;
