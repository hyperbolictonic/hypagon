---
name: Reuse Before Create
description: Enforces reuse of existing layouts, UI components, hooks, services, and utilities before creating any new file, component, hook, helper, or abstraction. Trigger BEFORE creating any new file, component, hook, utility, service, or module — and before duplicating anything that might already exist.
---

# Reuse Before Create

Agents duplicate code because they don't know what already exists. This skill makes
"what already exists" a mandatory check, not an afterthought.

## 1. Pre-flight check (mandatory, before writing ANY new file)

In order:

1. **Read the inventory.** Read `docs/COMPONENT_INDEX.md` if it exists. If it does not
   exist, generate it first:
   `node scripts/anti-slop/generate-component-index.mjs`
   (paths are relative to the repo root; adjust only if the repo uses different locations).
2. **Search the tree.** Grep/glob the source directories for anything that already
   solves the problem: components, layouts, hooks, utils, services, constants.
   Search by concept ("format date", "modal", "auth guard"), not just by exact name.
3. **Check `package.json`.** Before writing any custom utility, check whether an
   installed library already does it (date formatting, class merging, debounce,
   deep-clone, validation, state management, data fetching). Prefer the installed
   library. Only suggest a new dependency if nothing installed fits, and say so
   explicitly with the reason.
4. **Check for near-duplicates.** If an existing component solves 80% of the need,
   the answer is to extend it (props, `children`, variants) — never to clone it
   into a new file.

## 2. Hard rules

- **Never rewrite page shells.** Wrap pages/screens in the existing layout
  components. If a new page needs something the layout doesn't support, extend the
  layout with a slot (`children`, `header`, `actions` props) instead of building a
  parallel layout.
- **Rule of Two.** Create a NEW shared component/hook/util only when the pattern is
  used in 2+ places, or a single file exceeds ~150 lines. Otherwise keep it local
  to the feature. Conversely: on the second duplication, extract — do not write a
  third copy.
- **Extend, don't clone.** Existing primitives are extended via props, variants,
  render props, `children`, or slots. "I needed a slightly different version" is an
  extension task, not a new-file task.
- **Colocate, then promote.** Feature-specific helpers live inside the feature
  directory. Only promote to shared directories (`components/`, `hooks/`, `lib/`)
  when a second feature needs it — and then delete the local copy.

## 2b. What NOT to extract — framework scaffolding is not duplication

- **Declarative config is shape, not logic.** Repetition a framework *makes you
  write* — collection/field definitions, route tables, schema registrations,
  DI container setup — cannot "drift" the way two copies of logic can. The
  Rule of Two does not apply to it, and the clone gate excludes such files
  (list them under `ignore` in `anti-slop.config.json`). Do not wrap framework
  scaffolding in your own abstraction layers just because it repeats.
- **Framework primitives beat hand-rolled ones.** Before building any
  abstraction, check whether the framework already provides the primitive:
  auth/session handling, field-level access, validation, caching, file
  handling, background jobs. Reimplementing what the platform gives you
  creates a second source of truth — that is worse than repetition.
- **The dividing line is drift.** Extract a repeated block only when its copies
  could *behave differently* — a rule enforced in two places, an algorithm
  fixed in two spots. Shape that stays identical by nature of being
  declarative needs no extraction. If a declarative block embeds a real rule
  (e.g. who may read a record), extract that *rule* into one place and have
  every block reference it — the config stays, the behavior is single-source.

## 3. Backend / Node rules

- **Wrap external services behind adapters.** Direct SDK calls, `fetch` to third
  parties, and database clients live inside adapter/service modules. Feature code
  consumes the adapter interface. This keeps services swappable and mockable.
- **One env/config loader.** Never add a second way to read configuration. Extend
  the existing config module.
- **Shared logic goes in shared modules.** Validation, date/time, money, IDs,
  serialization: if it exists in one service, the next service imports it — it does
  not copy it.
- **Monoliths are defects.** If a file is growing past ~500 lines or a function
  past ~80, stop and split by responsibility (transport/service/domain/data —
  see the `modular-architecture` skill). Do not keep extending a god file.

## 4. Output requirement — the Reuse Plan

Before writing code, state briefly:

1. What you are reusing (exact file paths from the index/tree/package.json).
2. What you are extending (which file, which mechanism: props/slots/variant).
3. Anything genuinely new, and why existing abstractions cannot cover it.

If the Reuse Plan says "nothing new" there should be no new files in the diff.
If a task produces a new file that duplicates an existing one, that is a bug in
the plan, not in the code.

## 5. Keep the index true

Whenever this session adds a new shared component, hook, layout, or utility,
give it a one-line `/** When to use ... */` JSDoc above the export and update
`docs/COMPONENT_INDEX.md` (rerun the generator — it picks the description up
from the JSDoc automatically). A stale or undocumented index defeats the whole
system: the next session will duplicate what it cannot find.

## Anti-patterns (gotchas)

- Over-modularizing: tiny one-off features split into 5 files of boilerplate.
- Copying an existing component and changing one class name.
- Writing `formatDate`, `cn`, `debounce`, or `truncate` by hand while the
  equivalent sits in `package.json`.
- Creating a "v2" layout next to the existing layout instead of extending it.
