# Anti-slop findings and TODO

**Status:** baseline established · **Date:** 2026-11-18 · **Branch:** `anti-slop-house-keeping`

The gates were installed with `npx opencode-anti-slop --hooks` and a ratchet baseline was
generated, so existing debt does not block new work. Every number below is the committed baseline;
the gates fail only when a file grows beyond it, a new undocumented export appears, or a new clone
is introduced.

## Baseline snapshot

| Gate | Baseline | Notes |
| --- | --- | --- |
| Modularity | **53 violations** across **41 files** | file/function/class size budgets (300 / 80 / 10) |
| Docs | **431 undocumented exports** across **123 files** | one-line `/** When to use ... */` required |
| Duplicates | **1,791 duplicated lines / 46,833 (3.8%)** | threshold is 3%; 41 files with clones |
| Import cycles | **0** | 5 layer rules pass across 162 files |
| Component index | **161 files / 650 exports** | 431 still undocumented |

## Progress

- **P0 #1 done** - every export in `src/shared/viewport.ts` has a usage doc; the docs baseline
  dropped from 451 to 431 and the file left the baseline entirely.
- **P0 #2 done** - `http-bridge.ts` fell from 2,039 to 230 lines and is now only the server shell
  (CORS, human-control gate, logging, error mapping, dispatch chain). Every route family lives in
  `src/main/bridge/routes/*` behind a shared `BridgeContext` (`fail()`, memoised body, one response
  envelope) and one `ROUTES` table per family: `system`, `view`, `memory`, `inspection`, `network`,
  `interaction`, `session`, `primitives`, `decision`, `research`, `wrap`, `media`, `collaboration`.
  The duplicate baseline dropped from 2,250 to 1,857 lines (4.3% -> 4.0%) and modularity from 54 to
  53 violations. The contract test statically reads the `'METHOD /path'` keys, so every extracted
  route stays covered.
- **P0 #3 done** - `src/main/token-file.ts` owns the atomic token write and fail-closed read; the
  wrap and remote gateway modules are thin wrappers. The 37.8% / 27.1% clone pair is gone.
- **P1 #4 started** - explicit human control moved out of `browser-chassis.ts` into
  `src/main/input/human-control.ts` (`HumanControl` + `HumanControlHost`, 74 lines). The chassis
  keeps thin delegates, so `/human/*`, the HUD and the mutation gate are unchanged; verified live
  (takeover -> 409 on mutations -> resume -> 200). Next slices: sidebar/collab mode, viewport
  wrappers, research settings, capture, consent.
- Verified live on a dev instance (port 4125): 38 read routes across every family plus `act`,
  `navigate`, `markdown`, `tabs/new`, `tabs/close` and `tabs/switch` answer with unchanged shapes
  and status codes.



## Top findings

### 1. Oversized modules and functions

| Priority | File | Size | Violations | Suggested split |
| --- | --- | ---: | --- | --- |
| P0 | `src/main/browser-chassis.ts` | 4,816 lines | file, 3 functions, class | `ResearchRuntime`, `ViewportRuntime`, `HumanControl`, `Consent`, `Capture` |
| P1 | `src/renderer/main.ts` | 3,969 lines | file, 1 function | tabs, logs, settings, cortex, zoom already partly separate |
| P1 | `src/mcp/tools-catalog.ts` | 2,172 lines | file | one module per tool family; registry composes |
| P1 | `src/main/primitives/primitives.ts` | 1,825 lines | file | observe / act / extract / wait / collect |
| P2 | `src/main/collaboration/overlay.ts` | 1,418 lines | file | in-page script builder vs. service |
| P2 | `src/mcp/browser-mcp.ts` | 1,050 lines | file, 2 functions | tool registration, dispatch, formatting |
| P2 | `src/main/index.ts` | 854 lines | file, 1 function | app bootstrap vs. feature wiring |
| P2 | `src/main/cortex/cortex-db.ts` | 831 lines | file | schema, ingest, recall, maintenance |
| P2 | `src/main/wrap/executor.ts` | 788 lines | file | transport, adapter maps, rendering |
| P2 | `src/main/telemetry/input-simulator.ts` | 748 lines | file | pointer, keyboard, scroll, visual cursor |
| P2 | `src/mcp/wrap-server.ts` | 722 lines | file, 1 function | registration vs. dispatch |
| P3 | `src/main/llm/llm-surface.ts` | 629 lines | file | probe / fetch / read |
| P3 | `src/main/shadow-walk/ax-controls.ts` | 625 lines | file | scan vs. act |
| P3 | `src/main/media/service.ts` | 605 lines | file | jobs, auth, binaries |
| P3 | `src/main/marks/marks-overlay.ts` | 592 lines | file | inject, scan, remove |
| P3 | `src/main/media/jobs.ts` | 581 lines | file | queue vs. execution |
| P3 | `src/main/remote/service.ts` | 564 lines | file | lifecycle vs. API |
| P3 | `src/preload/index.ts` | 534 lines | file | one API object; split by domain |
| P3 | `src/main/wrap/secrets.ts` | 528 lines | file | store, cipher, host binding |

### 2. Duplication hotspots

| Priority | File | Duplicated lines | Likely cause |
| --- | --- | ---: | --- |
| P1 | `src/main/browser-chassis.ts` | 265 | repeated tab/clipboard/state helper patterns |
| P1 | `src/mcp/tools-catalog.ts` | 255 | repeated parameter/format scaffolding |
| P1 | `src/mcp/wrap-server.ts` | 153 | repeated tool registration |
| P1 | `src/mcp/tool-groups.ts` | 135 | action-to-tool mapping rows |
| P1 | `src/renderer/main.ts` | 111 | repeated DOM/state handlers |
| P2 | `src/main/index.ts` | 83 | repeated IPC registration |
| P2 | `src/main/wrap/anyapi/executor.ts` | 71 | transport/result mapping |
| P2 | `src/main/wrap/executor.ts` | 70 | transport/result mapping |
| P2 | `src/main/hil/hil-manager.ts` | 68 | notification/banner lifecycle |
| P2 | `src/main/primitives/primitives.ts` | 66 | repeated response envelopes |
| P2 | `src/main/shadow-walk/tab-walk.ts` | 55 | tab focus/restore |
| P2 | `src/preload/index.ts` | 52 | repeated IPC wrappers |
| P3 | `src/mcp/bridge-server.ts` | 39 | stdio lifecycle |
| P3 | `src/mcp/browser-mcp.ts` | 36 | dispatch/format |

The token-file pattern that used to clone (`remote/token.ts` 37.8%, `wrap/token.ts` 27.1%) now
lives in `src/main/token-file.ts`. `mcp/tool-groups.ts` stays 51.9% duplicated by design (mapping table).

### 3. Documentation debt

| Priority | File | Missing docs | Notes |
| --- | --- | ---: | --- |
| P1 | `src/main/shadow-walk/settings.ts` | 13 | policy/settings types |
| P1 | `src/main/wrap/render.ts` | 12 | exported helpers used by executor |
| P1 | `src/main/primitives/primitives.ts` | 11 | shared primitive surface |
| P1 | `src/main/recording/recording-service.ts` | 11 | public service API |
| P1 | `src/main/wrap/secrets.ts` | 11 | credential boundary |
| P2 | `src/main/cortex/cortex-db.ts` | 10 | memory API |
| P2 | `src/main/media/service.ts` | 10 | media API |
| P2 | `src/main/wrap/types.ts` | 10 | wrapper schema |
| P2 | `src/main/media/jobs.ts` | 9 | job API |
| P2 | `src/main/recipes/recipe-store.ts` | 8 | recipe storage |
| P2 | `src/shared/collaboration.ts` | 8 | shared thread types |
| P3 | `src/main/research/settings.ts` | 7 | settings schema |
| P3 | `src/main/crawl/crawler.ts` | 6 | injectable crawler API |
| P3 | `src/main/decide/decision-client.ts` | 6 | decision API |

### 4. Import boundaries

- **0 cycles** across 161 files.
- All 5 configured layer rules pass:
  - `src/shared/**` must not import `src/main/**` or `src/renderer/**`
  - `src/renderer/**` and `src/preload/**` must not import `src/main/**`
  - `src/main/**` must not import `src/renderer/**`
- No action; keep the rules as new modules land.

## Suggested TODO order

### P0 — make the gates meaningful

1. **Document `src/shared/viewport.ts`** — 15 exports; clears the newest shared-contract debt and
   gives the reuse skill a usable entry. **Done.**
2. **HTTP bridge route helper** — extract `readJsonAndRespond`, validation and error envelopes;
   target the 366 duplicated lines and the two oversized functions. This is the largest structural
   win with the least product risk. **Done:** the bridge is a 230-line server shell and every family
   is a `ROUTES` table in `src/main/bridge/routes/`.
3. **Token loader extraction** — one `readTokenFile`/`writeTokenFile` helper for
   `remote/token.ts` and `wrap/token.ts`. **Done** (`src/main/token-file.ts`).

### P1 — split by responsibility

4. **`browser-chassis` decomposition** — extract `ViewportRuntime` (already a controller), then
   `HumanControl`, `Consent`, `ResearchRuntime`, `CaptureRuntime`. Keep the chassis as composition
   root; update the extraction map.
5. **Finish `http-bridge` route modules** — all families are extracted; keep the `ROUTES`-table
   pattern and the contract test. No behavior change. **Done.**
6. **`tools-catalog` split** — one module per family with a registry; keep the contract test.
7. **`renderer/main` split** — tabs, logs, settings, cortex, web-state panels; reuse the existing
   research/viewport modules as the pattern.
8. **`primitives` split** — observe/act/extract/wait/collect, keeping `PrimitivesHost` stable.
9. **Docs pass on the P1 files** — shrink the 451-export baseline by documenting shared surfaces
   before moving them.

### P2 — cleanup and ratchet

10. **Wrap/media/cortex splits** and the repeated transport/result mapping.
11. **Remove clone regions** listed above; re-run `check-duplicates --update-baseline` only when
    the count actually shrinks.
12. **Component index quality** — the generator classifies most exports as `types` (573/650);
    improve the heuristic or add manual notes for the major services.
13. **Tighten the ratchet** — after each split, re-run:
    ```bash
    node scripts/anti-slop/check-modularity.mjs --update-baseline
    node scripts/anti-slop/check-docs.mjs --update-baseline
    node scripts/anti-slop/check-duplicates.mjs --update-baseline
    ```
    Commit the shrunken baseline with the refactor; never grow it to absorb new debt.

## Rules for the branch

- New files must stay under the budgets; the baseline covers legacy only.
- New exports need a one-line `/** When to use ... */` comment.
- Do not add a duplicate helper without checking `docs/COMPONENT_INDEX.md`.
- Run `npm run anti-slop:check` before commit; hooks enforce staged files.
- Keep import-layer rules green; no new cycles.
