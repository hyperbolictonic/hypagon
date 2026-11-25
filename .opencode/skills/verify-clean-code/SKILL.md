---
name: Verify Clean Code
description: Deterministic end-of-task verification — lint, typecheck, tests, duplicate-code detection, import boundaries, docs, and component-index freshness. Trigger before marking ANY coding task complete.
---

# Verify Clean Code

A task is not complete when the code works; it is complete when the checks pass.
Run from the repo root. Derive exact commands from `package.json` — do not guess.

## 1. Standard verification (in this order)

1. **Typecheck** — e.g. `tsc --noEmit` (or the repo's `typecheck` script).
2. **Lint** — the repo's `lint` script. Fix violations you introduced; do not
   disable rules or add `eslint-disable` comments to pass.
3. **Targeted tests** — run only tests covering the files you changed first;
   the full suite only if the change is cross-cutting.

## 2. Duplicate-code check

```sh
node scripts/anti-slop/check-duplicates.mjs
```

It tokenizes the source tree and fails when copy-paste duplication exceeds the
threshold (defaults tuned for typical repos; adjust in the target repo if it
has legacy duplication). If it flags your new code: extract into the existing
shared module (see reuse-before-create) rather than adjusting the threshold.
Never weaken the check to make it pass. Repos with a committed
`anti-slop.baseline.json` instead fail only on duplication newer than the
baseline — do not update the baseline to absorb your new debt. If the total is
unchanged after your change, you relocated debt rather than removing it: the
clone still exists, now harder to find. Fix the structure. The gate enforces
this: `--update-baseline` refuses to grow the total and warns when the file set
moves at an unchanged total; `--force` exists for a deliberate owner decision,
not as a convenience.

## 3. Modularity check

```sh
node scripts/anti-slop/check-modularity.mjs
```

Flags files over ~500 lines, functions over ~80, and classes with > ~10
public methods. The files you touched must pass. If the repo has pre-existing
violations elsewhere, report them — do not drive-by-fix unrelated files.
With a committed baseline, the gate fails only on violations beyond it.

## 4. Import-boundary check

```sh
node scripts/anti-slop/check-imports.mjs
```

Fails on circular dependencies and on any `imports.deny` layer rules the repo
has declared. A cycle means two responsibilities are fused — extract the shared
part into a module both can import; never fix a cycle with a re-export shim.

## 5. Documentation of shared exports

Every shared component, hook, util, service, or type you added or changed must
carry a one-line JSDoc above the export:

```ts
/** Renders the standard 2-column page shell; use for any new listing/settings page. */
export function TwoColumnLayout({ sidebar, children }: TwoColumnLayoutProps) {
```

This is mechanically enforced: `node scripts/anti-slop/check-docs.mjs` fails on
undocumented exports (the pre-commit hook runs it on staged files). Rerun
`node scripts/anti-slop/generate-component-index.mjs` after adding or removing
shared exports, and confirm the new entries show their description (not `-`) in
`docs/COMPONENT_INDEX.md`.

## 6. Testing discipline

The gates run the repo's tests; they cannot judge test quality. Apply these
rules to every test you write or touch:

- **Assert behavior, not implementation.** If a test breaks when you refactor
  without changing behavior, it is testing internals — rewrite it against the
  public surface.
- **Watch a new test fail once.** Run it against the unfixed code (or
  deliberately break the assertion) before trusting it. A test that has never
  failed may verify nothing.
- **Never weaken an existing assertion to make a test pass.** If the
  assertion is genuinely wrong, change the code or delete the test — and say
  which you did and why in the task report.
- **Reuse the repo's test factories and fixtures.** Tests follow the same
  reuse-before-create rules as production code: a second hand-copied test
  setup is extraction time, not a third copy.
- **One behavior per test; table-driven cases over near-identical copies.**
- **Do not write tests to hit a coverage number.** A hollow test that
  executes code without verifying anything is worse than the gap it hides.

If the repo enables `duplicates.includeTests` in `anti-slop.config.json`,
the duplicate gate watches test files too — the same Rule of Two applies
inside suites.

## 7. If the task was a refactor, review what you may have missed

Gates catch duplication that exists; they cannot catch load-bearing logic left
in the wrong layer or a skeleton built twice with different fillings. When the
task extracted components, merged duplicated flows, or moved rules between
files, run the `abstraction-review` skill before reporting, and include its
"Second-order opportunities" list in the report.

If the task de-slopped **existing** code, also apply the `deslopping`
redistribution test and include the band map in the report: a split whose
membership came from the old file's comments or line order is slop
redistribution, even when every gate is green.

## 8. Report

End the task with a short summary: checks run, results, files touched, and any
pre-existing issues you noticed but did not fix (report, don't drive-by-fix).

### Flaws in the anti-slop system itself

These rules are meant to be enforced, not trusted. If the **anti-slop system**
is wrong — a rule misleads you, a gate reports a false positive or misses a real
one, the installer crashes, a preset is wrong or inert, or the docs contradict
the behaviour — the report belongs in the anti-slop system's own issue queue:

**<https://github.com/hyperbolictonic/opencode-anti-slop/issues>**

That is the kit's tracker, **not the project's tracker** and not this repo's
issues. It is for flaws in the system (skills, commands, agents, gates,
installer, presets, docs) — never for the project's own debt: a duplicated
component, an oversized file, or disagreement with a threshold the user chose
belongs in the task report or the user's own tracker.

**Filing is a human decision, not an agent action:**

1. **Draft, don't file.** Write the issue (title + body) and show it to the
   user. Wait for an explicit "file it". A general "sounds good", silence, or
   your own judgement is not approval.
2. **Never include** their source, data, file paths, logs, env values or
   secrets. Reduce it to a minimal generic fixture.
3. **Search first** for an existing issue with the same symptom; comment on it
   rather than duplicating.
4. **If they decline,** record the finding in the task report and move on.
