---
name: Abstraction Review
description: Post-refactor review for missed abstractions — load-bearing domain logic living in UI components, and repeated skeletons with different content. Trigger AFTER completing a refactor or extracting components, and before finishing any task that moved shared logic. Reports; does not auto-extract.
---

# Abstraction Review

Gates catch duplication that already exists. This review catches duplication
that has not happened yet: logic that is single-consumer today but load-bearing,
and the same skeleton built twice with different fillings.

Run it **after** a refactor lands, not during. It reports and ranks; it does
not auto-extract. Speculative abstraction is the same failure as speculative
feature — the owner chooses what to build from the report.

## 1. Misplaced logic — the load-bearing test

Scan every file the task touched, especially anything under `components/` or
route files:

- Does a presentational file contain a rule that decides **meaning** — evidence
  strength, permission, money, time/thresholds, domain state names, dates that
  carry legal weight?
- The test: *could a second surface (back office, export, report, audit) need
  this exact rule?* If yes, it belongs in `src/lib/` (or `src/access/`), with
  the UI consuming it. Load-bearing rules — evidence, access, audit, money —
  are extracted even at one consumer; ordinary helpers wait for the second
  consumer (Rule of Two).
- Check the rule-locations table in AGENTS.md: after this change, is every row
  still true? Add or update a row for every rule the task wrote or moved. A
  rule whose location is not written down is a rule that will be re-implemented.

## 2. Same skeleton, different filling — the slot test

Run the clone report at low sensitivity
(`node scripts/anti-slop/check-duplicates.mjs --min-tokens 20 --threshold 0`)
and look past exact clones for **structural twins**:

- Two components rendering the same row/card/section shape with different
  trailing content (a badge vs a button vs a form) → one shared presentational
  component with a slot prop. Both consumers must exist today.
- Cross-surface candidates must respect the surfaces doctrine: only
  presentational primitives go in `components/ui/`; surface behavior stays in
  the surface.
- Two views that differ for *product* reasons are not duplication — do not
  force unification by turning the differences into config flags.

## 3. Near-clone triage

For each block in the low-sensitivity clone report, classify:

- **Real logic duplicated** → extract now (Rule of Two met; see
  reuse-before-create).
- **Framework scaffolding / declarative shape** → leave alone (see
  reuse-before-create, "What NOT to extract").
- **Unclear** → list it with the single question whose answer would settle it.

## Output contract — Second-order opportunities

End the task report with a ranked list; nothing is built without the owner
picking from it:

1. **What** the abstraction is and **where** it would live (exact file path).
2. **Why**: load-bearing rule (name the failure a diverged copy would cause),
   or second consumer (name both).
3. **Cost**: S / M / L.
4. Only items that meet the bar. A review listing twenty items is noise.

## Anti-patterns

- "We might need it in the back office someday" — that is speculation, not a
  load-bearing rule and not a second consumer.
- Forcing two product-different views into one config-flagged component.
- Reporting everything the low-sensitivity scan finds instead of triaging it.
- Extracting during the refactor instead of reporting after it — the review
  keeps the refactor's scope clean.
