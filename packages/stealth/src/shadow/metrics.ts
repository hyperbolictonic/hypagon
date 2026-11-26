/**
 * Counters for the sealed path.
 *
 * A host registers its own metrics sink once; the package never imports the app's
 * metrics module. The names match the app's existing `sealed.*` and `cdp.*` keys.
 */

/** When to use: the counters the sealed scanner reports. */
export type SealedMetricName = 'cacheHit' | 'scan' | 'nodes' | 'tokens' | 'pierce' | 'ax' | 'styleLookups';

type SealedMetricFn = (by?: number) => void;

let metrics: Partial<Record<SealedMetricName, SealedMetricFn>> = {};

/** When to use: a host installing its counters — pass nothing to clear them. */
export function setSealedMetrics(next?: Partial<Record<SealedMetricName, SealedMetricFn>>): void {
  metrics = next ?? {};
}

/** When to use: the scanner, gate and token registry — one increment with an optional amount. */
export function sealedMetric(name: SealedMetricName, by = 1): void {
  metrics[name]?.(by);
}
