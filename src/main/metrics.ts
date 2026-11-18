/**
 * Lightweight counters for the ops surface.
 *
 * No timers, no allocation per call beyond a Map read/write. The point is to answer "how much work
 * did that cost?" without a profiler: CDP commands per task is the metric browser-use's ultrafast
 * loop reports (1 092 → 101), and it is the honest way to see whether a change actually reduced
 * round trips.
 */

const counters = new Map<string, number>();
const startedAt = Date.now();

/** When to use: counting a CDP call, action or navigation for `/metrics`. */
export function bump(name: string, by = 1): void {
  counters.set(name, (counters.get(name) || 0) + by);
}

/** When to use: returning raw counters for `/metrics`. */
export function snapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of counters) out[key] = value;
  return out;
}

/** Grouped summary for `bridge_health` — three numbers instead of a wall of keys. */
export function summary(): { cdp: number; actions: number; navigations: number } {
  let cdp = 0;
  let actions = 0;
  let navigations = 0;
  for (const [key, value] of counters) {
    if (key.startsWith('cdp.')) cdp += value;
    else if (key.startsWith('action.')) actions += value;
    else if (key === 'nav') navigations += value;
  }
  return { cdp, actions, navigations };
}

/** When to use: `POST /metrics/reset` or a test that needs a clean counter set. */
export function resetMetrics(): { sinceMs: number } {
  const sinceMs = Date.now() - startedAt;
  counters.clear();
  return { sinceMs };
}
