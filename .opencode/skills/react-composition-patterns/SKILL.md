---
name: React Composition Patterns
description: Enforces composable React architecture — container/presentational separation, slots and children over prop drilling, compound components, and feature colocation. Trigger when building, refactoring, or reviewing React UI components, pages, and layouts.
---

# React Composition Patterns

## Architectural rules

- **Separate data from UI.** Data fetching, routing params, and mutations stay in
  pages/containers. Presentational components receive plain data and callbacks as
  props and stay stateless where possible. A component that both fetches and
  styles is a smell — split it.
- **Children and slots over prop drilling.** Pass JSX through `children` and named
  slot props (`header`, `actions`, `footer`) instead of threading config objects
  down multiple levels. If you are passing a prop through a component that doesn't
  use it, restructure with slots.
- **Compound components for multi-part UI.** Cards, modals, tables, tabs, toolbars:
  expose sub-components (`<Card.Header>`, `<Card.Body>`) rather than one component
  with a pile of boolean/config props. More than ~10 props, or several booleans
  that toggle unrelated regions, means the component wants to be compound.
- **Variant props, not sibling components.** Small appearance differences are
  `variant`/`size` props on one component, not `PrimaryButton.tsx` next to
  `SecondaryButton.tsx`.
- **Colocate, then promote.** Feature-specific subcomponents and hooks live in the
  feature directory. Promote to shared `components/` only when a second feature
  needs them (see the reuse-before-create skill).

## Layout rules

- One page shell per application concern. New pages compose existing layouts;
  they never re-implement header/sidebar/footer scaffolding.
- Layout components take slots so pages decide content; layouts decide placement.

## Anti-patterns (gotchas)

- Monolithic page components: one file doing fetching, derived state, layout,
  and markup.
- Prop drilling: a `config`/`settings` object threaded 3+ levels deep instead of
  composing children.
- Boolean-prop explosion: `<Widget isPrimary isCompact showHeader hideFooter>`.
- Premature abstraction on first use (violates Rule of Two) — colocate first.
- Over-modularizing trivial one-offs into many files of boilerplate.
