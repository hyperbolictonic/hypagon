---
name: React State, Effects and Context
description: Enforces correct usage of useState, useEffect, useMemo, useCallback, and React Context — bans derived-state effects, event-handling effects, premature memoization, and Context misuse. Trigger when managing state, side effects, memoization, or shared data in React code.
---

# React State, Effects and Context

## 1. `useEffect` — strict bans

- **Never compute derived state in an effect.** Calculate during render:
  `const fullName = `${first} ${last}``. If it needs to be cached, `useMemo` —
  never `useEffect` + `setState`.
- **Never react to user events with an effect.** Form submits, clicks, toasts,
  analytics belong in event handlers, not in an effect watching state change.
- **Never hand-roll data fetching in `useEffect` with raw `fetch`** when the
  project has React Query / SWR / RTK / Server Components (check `package.json`
  first). Use the project's existing mechanism.
- **Valid uses are narrow:** synchronizing with external systems outside React —
  DOM APIs (observers, measurement), WebSockets, `localStorage` listeners,
  third-party widget instances, non-React subscriptions. Always return a cleanup
  function that undoes exactly what was set up.
- **Effect dependency arrays must be complete.** No suppression comments to make
  warnings go away; if the array needs a lie, the design is wrong.

## 2. `useMemo` / `useCallback` — no premature memoization

Banned unless one of the "allowed" cases below applies:

- Never wrap primitives, string formatting, small array maps, or cheap boolean
  logic.
- `useMemo` is allowed only for: genuinely expensive transformations
  (filter/sort/aggregate on large datasets), or preserving referential identity
  of an object/array that flows into a `React.memo` child or an effect
  dependency array.
- `useCallback` is allowed only for: callbacks passed to memoized children, or
  functions used inside another hook's dependency array.
- The React Compiler (if enabled in the project) makes most manual memoization
  redundant — do not add it "just in case".

## 3. Context — composition first

- **Try composition first.** Before creating a Context to avoid prop drilling,
  check whether passing JSX via `children`/slots solves it. Most "prop drilling"
  problems are actually composition problems (see react-composition-patterns).
- **Context is for low-frequency global or subtree values:** theme, auth user,
  locale, i18n, compound-component coordination.
- **Never put high-frequency state in Context:** form inputs, scroll position,
  hover state, server-cache data. These re-render every consumer on every
  keystroke. Use component-local state, or a store library if the project has
  one.
- If a Context mixes a fast-changing value with a stable one, split into two
  contexts (value vs. dispatch/actions) so consumers can subscribe separately.

## Anti-patterns (gotchas)

- `useEffect(() => setState(derive(state)), [state])` — infinite-loop-prone and
  always wrong.
- `useEffect` + `fetch` + local loading flags when React Query exists.
- `useMemo` on `<100 item` arrays to "optimize" a table that renders fine.
- A `FormContext` wrapping every input on the page.
- New Context created where a slot prop would do.
