---
name: Modular Architecture
description: Enforces modular, object-oriented design for UI and non-UI code — single-responsibility modules, injected dependencies, and no monoliths, god classes, or god functions. Trigger when writing or refactoring Node/backend services, API routes, domain logic, shared libraries, splitting a large file or god class, or reviewing a decomposition.
---

# Modular Architecture

Monolithic code is a defect, not a style. Every module has one reason to
change; behavior enters and leaves through narrow interfaces. Applies to UI
and non-UI code alike.

## Module rules

- **Single responsibility per module/file.** A file that mixes persistence,
  business rules, and transport (HTTP) is a monolith — split by responsibility:
  transport -> service -> domain -> data access.
- **Program to interfaces.** Domain logic depends on small interfaces/ports
  (`UserRepository`, `MailSender`, `Clock`), never directly on SDKs, DB
  clients, `fetch`, or `process.env`. Infrastructure lives in adapters that
  implement those ports.
- **Inject dependencies; don't import globals.** Constructors/factories accept
  their dependencies. This makes composition explicit and testing trivial
  (pass fakes, no module mocking). One composition root (or config module per
  entrypoint) wires concrete adapters to ports.
- **One direction of dependencies.** Domain logic imports nothing from
  transport or infrastructure. Framework code (Express handlers, Next.js
  route files) is a thin shell delegating to framework-free services.
- **Shared logic is extracted, not copied** (see `reuse-before-create`); shared
  modules are consumed through their public exports, never by reaching into
  internals.
- **State stays narrow.** No module-level mutable singletons beyond the
  composition root. Class state is `private`/`#private` until proven needed.

## Object-oriented rules

- **Classes for things with state + behavior** (entities, adapters, parsers,
  clients). Plain functions for stateless operations. Don't force everything
  into classes, and don't write 500-line procedural scripts either.
- **Small public surface.** Export the minimum; if a class exposes > ~10
  public methods, it is doing several jobs — split by responsibility.
- **Composition over inheritance.** Extend behavior by wrapping/injecting,
  not by deep class hierarchies. Inheritance more than one level deep needs a
  justification in the Reuse Plan.
- **God-object test:** naming a class `Manager`, `Helper`, `Utils`, `Common`,
  or `Service` alone is a design smell — name by responsibility
  (`InvoiceMailer`, `SessionStore`).

## Decomposing a monolith: components, not chunks

A size budget is a **proxy** for "this file has too many responsibilities".
When it fires on a 4,000-line god class, the cheapest way to make the number
smaller is to move text — and moving text is never decomposition.

**The rule.** A component is a class (or small module) that owns one
responsibility, declares its dependencies explicitly (a `…Deps` interface),
and is reachable through a field on the composed object (`chassis.research`).
Anything selected by **line numbers** is a chunk, not a component.

| Accepted | Rejected |
|---|---|
| `class ResearchSurface` + `ResearchDeps` → `chassis.research` | `part-1.ts`, `part-2.ts` cut by line count |
| State moved first to its own module (`researchState`) | `base.ts` → `init.ts` → `state.ts` inheritance chain |
| Explicit seams (injected logger, UI port) | Moving methods without the state they touch |
| One component per commit, gates after each | A per-file line-budget override to silence the metric |

**The tell.** If the metric goes green while the class still owns the same
responsibilities and dependencies, it is a remix of the slop. Count
responsibilities, not lines.

### Band by domain before you cut

Group members by shared **state**, **change reason**, **consumer**, or **data
flow** — never by line ranges, file order, or the previous author's
`// --- section ---` banners. Members of different bands must be able to change
without touching each other; if a change to one forces a change in the other,
they are one band or the cut is in the wrong place.

When the file is existing code, the input is untrusted: comments and folder
names are claims to verify against behavior, not boundaries to preserve. A
mislabeled band is part of the slop — re-derive it and delete the false comment
rather than carrying it into a new file. See `deslopping` for the evidence
inventory, band map and redistribution test.

### Why the lazy fixes fail

| Lazy fix | What it costs |
|---|---|
| Cut by line range | Slices through field initializers and methods; the typechecker fails on every cut expression |
| Inheritance chain of parts | Still one class across files, plus invented rules (a field cannot call a derived method); usually reverted |
| Move a block by line numbers | Private helpers interleaved in the range are used elsewhere and break |
| Move methods, leave state | `this.state` / `this.broadcast` / `this.emit` errors |
| Raise the budget or add an override | The monolith becomes invisible; the gate now protects nothing |
| Update the duplicates baseline after a split | Debt relocated at the same total — an accepted clone nobody can find |

The loop is always the same: metric fires → cut text → compile error → revert
→ chain parts → still one class → raise the budget → green, nothing improved.
Eight reverted attempts on one file is the normal cost of skipping the
inventory.

### Review checklist — reject a split if ANY answer is "no"

1. **Named responsibility.** Can a reviewer state the module's one job in one
   sentence without saying "part of the old class"?
2. **Explicit dependencies.** Does it take a `…Deps` interface, or reach back
   into the original class/closure? Reaching back = rejected.
3. **No text slicing.** Were members chosen by responsibility and moved whole,
   including the private helpers they call? `part-*`, `base.ts` + chain, or
   line-range moves = rejected.
4. **State moved first.** Shared state lives in its own module *before* the
   behaviour that mutates it, and is mutated in place — not copied.
5. **Call sites updated.** Consumers go through the new surface; the public
   entry point stays stable.
6. **Gates, not baseline.** All gates pass *and* the duplicates total dropped
   or stayed level — never rose to absorb a move.
7. **Fits its own budget.** The component is ≤ 500 lines. A bigger
   responsibility is split by sub-responsibility *before* the file is written
   (research = llm / crawl / citations, not one 862-line surface).

### Red flags (auto-reject)

- `part-*`, `base.ts`, `*-part-a` file names.
- A class that `extends` another only to split a file.
- A per-file budget override (`fileLineOverrides`): the kit has none — the key
  is rejected and the limit still applies.
- Duplicates baseline updated with an unchanged total.
- Lines selected by line number instead of by member.
- A component larger than the budget that triggered the split.

### The procedure that works

1. **Inventory by responsibility**: for each member, its size and every
   `this.*` it touches — field (state) or method (behaviour).
2. **Move the state first** to its own module, mutated in place.
3. **Define the component**: class + explicit `…Deps`, one responsibility,
   ≤ 500 lines.
4. **Expose it as a field** on the composed object — never a link in an
   inheritance chain.
5. **Update call sites**; keep the entry point stable.
6. **One component per commit**, typecheck + gates after each.

## Size budgets (enforced by scripts/anti-slop/check-modularity.mjs)

- File: <= ~500 lines.
- Function/method: <= ~80 lines.
- Class: <= ~10 public methods.
- Declared exports per file: <= ~20 (re-exports belong to barrels; they are
  not counted, so `export *` cannot hide a junk drawer).

Each limit has two bands: a **soft** band (80% of the cap) that prints a note
and passes, and a hard cap that fails. The soft band exists so the budget
applies pressure before it applies a wall — when it fires, look at the
responsibility count, not just the number.

A file that genuinely cannot fit may declare a **justified exception next to
the code**:

```ts
// anti-slop: file-lines 620 — generated parse table, one artifact
```

Rules: the reason is mandatory; the declared number is the new ceiling (grow
past it and the gate fails again); exceptions are per limit (a `file-lines`
exception never excuses `class-methods`); every exception is printed on every
run; and the repo allows 3 (`maxExceptions`) — more than that is a pattern, not
an exception. Never raise the budget, add a per-file override, or exempt the
file in config; those are the lazy fixes this skill rejects.

## Anti-patterns

- 500-line `utils.ts` accumulating everything nobody could place elsewhere.
- Route/handler files containing validation + business rules + DB queries +
  email sending inline.
- `import { pool } from "../db"` inside domain logic instead of an injected
  repository interface.
- A class with 25 public methods, 3 of which are used.
- "Refactoring" a monolith by moving it into two monoliths.
