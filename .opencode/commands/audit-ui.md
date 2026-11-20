---
description: Audit code for duplication, monolithic structure, missing docs, and layout-reuse violations
---

Load the `reuse-before-create`, `layout-composition`, `react-composition-patterns`, and `modular-architecture` skills before auditing.

Run the deterministic checks first and read their full output:

!`node scripts/anti-slop/check-duplicates.mjs --min-tokens 20 --threshold 0`

!`node scripts/anti-slop/check-modularity.mjs --report-only`

Scope: $ARGUMENTS. If no scope was given, audit the whole source tree.

Produce a prioritized report (no code changes — a refactor plan only):

1. **Duplication clusters** (from the clone report): for each clone, name the
   existing component/hook/util that should absorb it, or the new shared
   abstraction to extract, with exact file paths.
2. **Monoliths** (from the size report): propose a concrete decomposition for
   each flagged file/function/class — transport/service/domain/data or
   container/presentational splits, one paragraph each.
3. **Layout reuse**: pages that re-implement the same skeletons (columns,
   shells, headers). Propose the shared template + slot design.
4. **Missing documentation**: shared components/hooks/utils whose exports lack
   a one-line `/** When to use ... */` JSDoc; list them in priority order.
5. **Misplaced logic and abstraction candidates**: load the `abstraction-review`
   skill and apply it to the scope — load-bearing rules implemented inside
   presentational components, and structural twins (same skeleton, different
   slot content) that no longer trip the exact-clone threshold.

Order items by impact: duplication that will multiply next, then monoliths
actively being extended, then layout rewrites waiting to happen, then docs.
End with the three highest-value first actions.
