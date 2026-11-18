/**
 * Identifiers and vocabulary shared by the wrapper validator and request normaliser.
 *
 * When to use: checking a wrapper id/secret name, or iterating the HTTP methods a
 * wrapper may declare. Do not redeclare the regex or the method set elsewhere.
 */

/** When to use: validating a wrapper id or secret name (lowercase segments joined by `._-`). */
export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/** When to use: the HTTP methods a wrapper may declare. */
export const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
