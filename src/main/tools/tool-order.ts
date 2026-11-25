/**
 * When to use: sort a tool list by the user's configured rank, with a stable
 * surface order as the tie-break.
 *
 * The tool manager, the MCP registry and the `tools/list` handler all publish
 * the same ordering rule: explicitly ranked entries come first in rank order,
 * unranked entries keep the surface's own sequence. Keeping the rule here stops
 * three copies of the comparator from drifting.
 */
export function byConfiguredRank<T extends { name: string }>(
  configured: ReadonlyMap<string, number>,
  fallbackOrder: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const aRank = configured.get(a.name);
    const bRank = configured.get(b.name);
    if (aRank !== undefined || bRank !== undefined) {
      if (aRank === undefined) return 1;
      if (bRank === undefined) return -1;
      if (aRank !== bRank) return aRank - bRank;
    }
    return fallbackOrder(a, b);
  };
}
