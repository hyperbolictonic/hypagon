---
description: Evidence-first de-slopping plan — band map, false-band audit, removal list, ordered split plan, and a structural acceptance table that gates alone cannot satisfy
---

Load the `deslopping` and `modular-architecture` skills before starting.

Record the baseline. These numbers are the **target to beat**, not the goal —
a refactor is not done because they turned green:

!`node scripts/anti-slop/check-modularity.mjs --report-only`

!`node scripts/anti-slop/check-duplicates.mjs --threshold 0 --summary`

## Scope and queue

`/deslop` plans **one file** (or one class/function) per run — the band map is
per unit, and a plan for a whole tree is a plan for nothing.

- `$ARGUMENTS` is a file path → plan that file.
- `$ARGUMENTS` is a directory or several paths → build a **queue** from the
  modularity output above, one line per violation as
  `file · metric size`, largest first. Print the queue, then plan **only** the
  first entry. Do not start file 2 until file 1 is accepted or skipped.
- No arguments → ask which file. If the user says "everything", print the queue
  and ask which one to start.

## Phase 1 — Inventory (read-only, no edits yet)

For every file in scope, list each member (function, method, field) with its
size, and for each member every `this.*` / module symbol it touches, labelled
**state** or **behaviour**. Find callers with grep/glob and note which consumer
they belong to. For co-change, `git log --format=%h --name-only -- <file>` and
cluster members by the commits that touch them.

## Phase 2 — Audit the existing banding

List every section comment, banner, folder name and "domain" claim in scope.
For each, produce a verdict — do not accept a claim because it is written down:

| Claim | Actual members | Shared state / change reason / consumers | Verdict |
|---|---|---|---|
| `// --- Helpers ---` | getCurrentUser, formatMoney, buildWhere | three consumers, three change reasons | fiction |

Verdicts are `real`, `mixed` (partly right) or `fiction`. Fiction bands are part
of the slop: the plan must rename or delete the claim, not carry it forward.

## Phase 3 — Band map (the deliverable)

One line per band:
`name — members — shared state — consumers — change reason — why they cohere`.

Bands must pass the independence test: a change to one band must not force a
change in another. If two bands keep co-changing, merge them or move the cut.
Sharing a prefix, a file or a comment is not a domain.

## Phase 4 — Remove before moving

Fake seams (modules that only re-export a closure), dead abstractions
(one-implementation interfaces), ownerless buckets (`utils`/`helpers`/`common`),
and duplicates that would ride along into a new file. Dedupe first: a clone that
moves is debt relocated, not removed.

## Phase 5 — Ordered plan

State first, then components, then consumers. One band per commit. For each
step: files created/changed, members moved **by name** (never by line range),
consumers updated, and the gate command that must pass afterwards.

If the unit cannot be split honestly and qualifies for a rewrite (`deslopping`
§6), say so and plan the rewrite instead: characterization evidence first, then
the new structure, then deletion of the old path **in the same step**, with the
behaviour ledger as a required deliverable.

## Phase 6 — Acceptance table

State the numbers, not adjectives:

| Check | Baseline | After | Required |
|---|---|---|---|
| modularity violations in scope | N | ? | 0 |
| duplicated lines (repo total) | N | ? | must not rise |
| each new module ≤ budget, 7-point checklist | — | ? | pass |
| band map written and reviewed | — | ? | yes |
| behaviour ledger complete *(rewrites only)* | — | ? | every member mapped |
| old path deleted, no dual implementation *(rewrites only)* | — | ? | yes |
| behaviour unchanged — tests or log on both sides *(rewrites only)* | — | ? | yes |

**A green metric with the same responsibilities and dependencies is a failure.**
Say so explicitly if the only thing that changed is where the text lives.

## Output

Produce the report only — band map, false bands found, removals, ordered steps,
acceptance table. No code changes.

If the arguments include `apply` (e.g. `/deslop apply src/session.ts`), carry on
after presenting the plan: execute one band per commit, re-run the gates after
each, and update the acceptance table. With a queue, walk it in order — one file
at a time, stopping at the first rejection and reporting it rather than
continuing to "make progress". If a step cannot meet the table, stop and report
the blocker rather than adjusting the plan to fit the gates.

## Autopilot (apply) — ask once, then run

A batch de-slop must not stop for approval at every band. Before the first
change, ask **once** for a review cadence and record it:

- **`off`** — gates only, no reviewer.
- **`risk`** (default for autopilot) — review when `review-scope` flags a risk
  path, plus one review of the whole batch at the end.
- **`end`** — one review of the whole batch when the queue finishes.
- **`each`** — review after every band commit (expensive; cap the number of
  runs you will spend before you start and say so).

Then follow it without further prompts: log each verdict, stop the queue on
`Reject`, and report all verdicts together at the end. `review.autonomy: "auto"`
in `anti-slop.config.json` is the repo default; the per-run choice overrides it.
If `review.enabled` is `false` (or the user says they have their own review
system), skip the question entirely and run with gates only.
