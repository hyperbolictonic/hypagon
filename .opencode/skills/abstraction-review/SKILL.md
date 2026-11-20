---
name: Abstraction Review
description: Post-refactor review for missed abstractions — load-bearing domain logic living in UI components, repeated skeletons with different content, and accidental duplication created by a file split. Trigger AFTER completing a refactor, after splitting a monolith or extracting components, and before finishing any task that moved shared logic. Reports; does not auto-extract.
---

# Abstraction Review

Gates catch duplication that already exists. This review catches duplication
that has not happened yet: logic that is single-consumer today but load-bearing,
and the same skeleton built twice with different fillings.

Run it **after** a refactor lands, not during. It reports and ranks; it does
not auto-extract. Speculative abstraction is the same failure as speculative
feature — the owner chooses what to build from the report.

If the task **split a file**, run the decomposition checklist in
`modular-architecture` first: a split review is only meaningful once the output
is a component (one responsibility, explicit deps, state moved first) rather
than a chunk selected by line numbers. A chunk that passes this review is still
a failed decomposition.

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

Before calling anything systemic, apply the occurrence test in section 4 — the
line count is not the signal.

## 4. Duplication: incidental vs systemic

The clone report gives you lines; it cannot tell you whether the repetition is
a problem. Judge the **occurrences of the skeleton**, not the line count.

- **Incidental (N = 2, small overlap)** — two functions sharing a short prelude
  (resolve → validate → call), or a few dozen lines of local overlap.
  **Leave it.** A helper here adds indirection and couples two things that may
  legitimately diverge.
- **Systemic (N ≥ 3, same shape)** — the same skeleton restated many times,
  whatever each copy's length: schema/field shapes repeated across a catalog
  (one `commonFields` object removes all of it); two copies of one control flow
  such as prepare → fetch → render (one shared pipeline type/helper); repeated
  wiring such as `ipcRenderer.invoke('x')` per channel (one `channel()` helper);
  three or more components rendering the same skeleton with different fillings
  (section 2).
- **Decomposition-induced** — the clone exists only because a split created
  it. The split was wrong: fix the split, do not teach the gate about the
  clone.

"Six functions all do the same thing" is systemic even when every copy is
short; one 50-line overlap between two functions is incidental even though it
is the largest number in the report.

**Never relocate debt into the baseline.** Updating `anti-slop.baseline.json`
after a split that moved duplication keeps the total identical: the clone still
exists, now invisible to the gate. The total must **fall, or at worst stay
level — never rise**. The baseline already treats a clone in a new file as new
debt; re-baselining defeats exactly that.

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
