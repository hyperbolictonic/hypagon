---
name: Layout Composition
description: Enforces shared layout skeletons with slotted content — pages with the same structure (2-column, dashboard, settings) MUST reuse one template with different sub-components, not re-implement markup. Trigger when building or refactoring pages, layouts, screens, grids, or navigation shells.
---

# Layout Composition

A layout is a skeleton (columns, regions, chrome), not content. Pages with the
same structure must share one skeleton and differ only in what they put in the
slots.

## Core rule

When N pages share the same structural shape:

1. Extract the skeleton once: `<TwoColumnLayout>`, `<DashboardShell>`,
   `<SettingsLayout>` — placement only, no page-specific content, no data
   fetching.
2. Each page composes: page decides content, skeleton decides placement.
3. Page-specific widgets are their own components, passed in via slots.

```tsx
// Good: three pages, one skeleton
<TwoColumnLayout sidebar={<AuditFilters />}>
  <AuditTable events={events} />
</TwoColumnLayout>

<TwoColumnLayout sidebar={<UserFilters />}>
  <UserTable users={users} />
</TwoColumnLayout>
```

```tsx
// Bad: the second and third page re-implement the 2-column markup
export function UsersPage() {
  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      <aside>...</aside>
      <main>...</main>
    </div>
  );
}
```

Signals that a skeleton wants to exist:

- Copy-pasting grid/flex structure between two or more pages.
- Repeating the same `<aside>`/`<main>`/header/scaffold markup.
- "New page" tasks that start by writing container divs instead of picking a
  template.

## Design rules for skeletons

- **Slots over config.** Named slots (`sidebar`, `header`, `actions`,
  `footer`) take JSX. Never pass booleans like `showSidebar` down a template —
  pass the content or don't render the slot.
- **Skeletons are dumb.** No fetching, no derived state, no store access.
  Only responsive behavior and placement.
- **Empty regions stay empty.** An unfilled slot renders nothing — not a
  placeholder "coming soon" block.
- **Nesting composes.** `<DashboardShell>` may use `<PageHeader>` and
  `<TwoColumnLayout>` internally; pages never reach past the outermost shell.
- **Responsive rules live in the skeleton** (where the grid is), not repeated
  per page.

## Extraction timing

- First occurrence: build it locally but structure it as slots from day one.
- Second occurrence: extract the skeleton (Rule of Two — see
  `reuse-before-create`) and make both pages use it. Never write a third copy.

## Anti-patterns

- `UsersLayout.tsx` + `AuditLayout.tsx` + `ReportsLayout.tsx` that differ only
  in imported children.
- A layout component with 10 `show*/hide*` props instead of slots.
- "Template + slot" where the template secretly renders page content.
- Pages hand-rolling the same max-width/spacing/padding wrapper.
