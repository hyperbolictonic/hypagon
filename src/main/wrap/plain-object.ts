/**
 * Structural predicate shared by the wrapper validator and the argument validator.
 *
 * When to use: checking a parsed value is a JSON object (not null, not an array)
 * before reading keys off it. Do not copy this predicate into another module.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
