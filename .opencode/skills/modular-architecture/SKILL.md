---
name: Modular Architecture
description: Enforces modular, object-oriented design for UI and non-UI code — single-responsibility modules, dependency injection behind adapters, and no monolithic files, god classes, or god functions. Trigger when writing or refactoring Node/backend services, API routes, domain logic, shared libraries, or splitting large files.
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

## Size budgets (enforced by scripts/anti-slop/check-modularity.mjs)

- File: <= ~300 lines.
- Function/method: <= ~80 lines.
- Class: <= ~10 public methods.

Exceeding a budget is a signal to split by responsibility — not to compress
code or disable the check.

## Anti-patterns

- 500-line `utils.ts` accumulating everything nobody could place elsewhere.
- Route/handler files containing validation + business rules + DB queries +
  email sending inline.
- `import { pool } from "../db"` inside domain logic instead of an injected
  repository interface.
- A class with 25 public methods, 3 of which are used.
- "Refactoring" a monolith by moving it into two monoliths.
