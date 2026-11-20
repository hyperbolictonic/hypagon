# Anti-slop findings and TODO

**Status:** baseline established · **Date:** 2026-11-18 · **Branch:** `anti-slop-house-keeping`

The gates were installed with `npx opencode-anti-slop --hooks` and a ratchet baseline was
generated, so existing debt does not block new work. Every number below is the committed baseline;
the gates fail only when a file grows beyond it, a new undocumented export appears, or a new clone
is introduced.

## Baseline snapshot

| Gate | Baseline | Notes |
| --- | --- | --- |
| Modularity | **17 violations** across **9 files** | file/function/class size budgets (300 / 80 / 10) |
| Docs | **0 undocumented exports** across **0 files** | empty baseline — every export carries `/** When to use ... */` |
| Duplicates | **919 duplicated lines / 49,791 (1.8%)** | threshold is 3%; 25 files with clones |
| Import cycles | **0** | 5 layer rules pass across 250 files |
| Component index | refreshed with `npm run anti-slop:index` | see `docs/COMPONENT_INDEX.md` |

## Progress

- **Wrap executor split** - `wrap/executor.ts` 773 -> 170, and its 273-line `execute()` is gone:
  `execute.ts` (the entry point and the one error boundary), `execute-prepare.ts` (validation,
  request building, credential resolution), `execute-fetch.ts` (pagination loop, audit, one OAuth2
  re-mint), `execute-compose.ts` (render, Cortex indexing, AUTH_REQUIRED vs HTTP_ERROR), plus
  `pagination.ts` (`pagePlan`/`itemsOf`/`nextPageToken`/`mergePages`/`documentsToIndex`),
  `response.ts` (redirects, host policy, byte cap, `WrapTransportError`) and `execution-types.ts`.
  Verified: `test:wrap` 55/55 (including the refresh-once retry, static-credential no-retry and
  `lastVerified` cases), `test:anyapi` 17/17, `test:wrap:mcp` 15/15.
- **Wrap server split** - `mcp/wrap-server.ts` 728 -> 77 (and both its violations are gone):
  `wrap-config.ts` (bridge URL/timeout/token, the generated-tool cap, `callBridge`), `wrap-log.ts`
  (file-first diagnostics + shutdown), `wrap-format.ts` (result/preview/manifest/secret text and the
  `failureText` refusal shape), `wrap-tools.ts` (the nine meta-tools, registered through one
  `defineTool`), `wrap-generated.ts` (the `wrap_<id>` registry) and `process-guards.ts` (EPIPE,
  stdin-close and stray-async guards shared with `bridge-server.ts`). The registrations lost their
  repeated `server.tool(... try/catch)` skeleton, so duplicates fell as well. Verified:
  `test:wrap:mcp` 15/15, `test:mcp:surface` 35/35, `test:mcp:contract`, `npm run build:mcp`.
- **Tool ordering deduplicated** - `shared/tool-settings.ts` now owns `compareByRank` (saved rank, then a
  caller fallback) and `collectActionInstructions` (normalise saved per-action text through a caller
  filter). `main/tools/state.ts` and `mcp/browser-mcp.ts` had three copies of the rank comparator and
  two of the action-instruction walk. Verified: `test:mcp:contract`, `test:mcp:surface` 35/35.
- **LLM surface split** - `llm/llm-surface.ts` 637 -> 232: `llm-types.ts` (published shapes),
  `llm-net.ts` (session fetch, accept headers, content-type rules, `coded`), `llm-probe.ts`
  (`LlmProbe`: origin/page probes, alternate ranking, `recommend`) and `llm-read.ts` (paging +
  render fallback). Verified: `test:llm` 22/22 (page vs origin scope, anchor-discovered alternate,
  render fallback reasons, paging/next_cursor).

### Queued for the next session (still over the file budget)

`mcp/wrap-server.ts` (728 + 1 function), `telemetry/input-simulator.ts` (750), `wrap/executor.ts`
(773), `cortex/cortex-db.ts` (841), `index.ts` (866 + 1 function), `mcp/browser-mcp.ts` (1053 +
2 functions) — then the five giants: `collaboration/overlay.ts` (1420), `primitives/primitives.ts`
(1836), `mcp/tools-catalog.ts` (2180, with `scripts/test-mcp-contract.mjs` in the same commit),
`renderer/main.ts` (3960), `browser-chassis.ts` (4637 + 3 functions + 16-method class).
- **Marks overlay split** - `marks/marks-overlay.ts` 594 -> 168: the injected badge script is now
  three page-side phases (`injected-helpers.ts`, `injected-collect.ts`, `injected-assign.ts`) composed
  by `injected-script.ts`. The generated script was diffed against the previous build and is
  byte-identical. Verified: `test:framemarks` 13/13 (including OOPIF click/type and 100+ ids).
- **Sealed discovery split** - `shadow-walk/ax-controls.ts` 611 -> 132: `sealed-types.ts` (published
  shapes + the rate-limit error), `sealed-util.ts` (role actions, viewport, closed-root index,
  quad->rect), `sealed-scan.ts` (AX tree + pierce) and `sealed-measure.ts` (filter + boxes + tokens),
  with `sealed-sessions.ts` owning attach/detach so the two phases cannot drift. The extraction also
  collapsed the quad->rect math repeated in `sealed-targets.ts` and `tab-walk.ts`. Verified:
  `test:sealed` 21/21 (same-site and cross-site frames, offscreen tokens, scroll+click, rate limit)
  and `test:tabwalk` 11/11.
- **Cheap-slice sweep** - the mid-size files are out of the modularity baseline: `tabs/tab-manager`
  (513 -> 217 across `types.ts`, `tab-views.ts`, `popups.ts`, plus a shared `input/takeover-shortcut.ts`
  the shell and tabs now both use), `renderer/research-panel` (514 -> 112 across `research-dom.ts`,
  `research-controller.ts`, `research-citations.ts`, which also removed the 151-line event handler),
  and `preload/index` (535 -> 269 across `api-types.ts`, with `ConnectInfo` moved to `shared/types.ts`
  so the renderer no longer restates it). Verified: `test:mcp:surface` 35/35 (after teaching the suite
  to forward `HB_BRIDGE_URL` to the spawned MCP server), `test:research` 7/7, `test:research:events`,
  `test:act` 26/26, `vite build` clean.
- **Remote service split** - `remote/service.ts` 565 -> 300 across `gateway-child.ts` (spawn, port
  readiness, SIGTERM/SIGKILL tree, stderr tail, exit reporting), `tunnel.ts` (`RemoteTunnel`:
  token/hostname persistence, `normalizeHostname`, enable/disable, public URL, status) and
  `cloudflared-control.ts` (managed vs system binary, last check, install, automatic check).
  Parameter properties were replaced with explicit fields after the remote suite caught that it
  type-strips instead of transpiling. Verified: `npm run test:remote` — gateway smoke (19 tools),
  remote service, remote OAuth all pass.
- **Media service split** - `media/service.ts` 615 -> under budget: `media-types.ts` (published shapes),
  `media-info.ts` (the `--dump-single-json` run and `buildInfo`), `media-read.ts` (`MediaReader`:
  transcript paging, preview degradation, artifact resolution) and `media-artifacts.ts`
  (`pickLanguage`, bounded `TranscriptCache`, `loadArtifacts`). `dlp-failure.ts` now owns the
  timeout wording and stderr tail both `media-info` and `transcript` used to repeat — which removed an
  accepted clone, so duplicates also fell. Verified: `test:media` 22/22 plus a 30-case probe
  (metadata mapping, audio-only detection, language choice, cache TTL/eviction/index flags, failure
  wording, missing-binary refusals, preview degradation, cookie handoff).
- **Media jobs split** - `media/jobs.ts` 590 -> 300: `job-types.ts` (the published shapes and options),
  `job-queue.ts` (bounds, job factory, sort/count/prune), `job-history.ts` (fail-open load, atomic
  save, 250 ms debounced `JobHistoryWriter`) and `download-stream.ts` (the idle clock, the hard
  ceiling, progress/title parsing and the stderr tail). `job-files.ts` and `ytdlp-args.ts` keep the
  spawn/kill/file-listing helpers and the yt-dlp argument + progress-line rules. Verified:
  `test:media` 22/22 plus a 17-case probe (interrupted history, prune cap/order, counts, debounce
  flush, progress/merger/title parsing, stderr tail, timer release).
- **Crawl split** - `crawl/crawler.ts` 423 -> 229: `crawl/types.ts` holds the published shapes
  (`CrawlOptions`, `CrawlPage`, `CrawlOutcome`, `CrawlerDeps`) and `crawl/urls.ts` the pure rules
  (`normalizeUrl`, `matchesAnyPattern`, `linksFromMarkdown`). Re-exported from the crawler, so no
  caller changed. Verified: `test:crawl` 7/7 (depth, budget, patterns, same-origin, LLM tier, Cortex).
- **Secret store split** - `wrap/secrets.ts` 539 -> 292: `secret-types.ts` (published shapes and the
  injected cipher/minter), `secret-storage.ts` (fail-closed read, atomic 0600 write, metadata), 
  `secret-validation.ts` (every refusal rule, pure) and `oauth-mint.ts` (the client-credentials
  exchange). The reorder surfaced one TDZ bug (`existing` looked up via `name` before declaration),
  caught by inspection and fixed. Verified: `test:wrap` 55/55, `test:anyapi` 17/17, plus a 21-case
  validation probe (name/value/hosts/header/prefix/OAuth2 rules, keep-existing, wildcard hosts).
- **Docs gate closed** - 431 -> 0 undocumented exports (123 -> 0 files). The docs baseline is empty,
  so a new export without a usage line fails immediately.
- **Network capture split** - `network-interceptor.ts` 424 -> 252 lines plus `network/stream-capture.ts`:
  websocket/SSE lifecycle and the rolling message buffer now live in `StreamCapture`, and the CDP
  dispatcher has one handler per event kind (`captureRequest`/`captureResponse`/`captureBody`/
  `captureStreamEvent`). Verified: 2 streams, SSE dedupe, JSON flags, filters, cap, close/error, clears.
- **HIL notification split** - `hil/hil-manager.ts` 436 -> out of the baseline plus `hil/notifier.ts`:
  the toast, the long-slot Windows XML, click-to-focus and the no-focus surface are one object. The
  extraction exposed a real clone - `resolveIntervention` and `cancelIntervention` were the same
  skeleton - now one `finish()` that keeps the exact difference (cancel records no history notes).
  `ui/brand-icon.ts` is shared with the tray.
- **anyapi executor split** - `wrap/anyapi/executor.ts` 436 -> out of the baseline across `gate.ts`
  (what the core can serve exactly), `plan.ts` (declared arguments, redacted preview) and
  `payload-store.ts` (retains nothing). `wrap/executor-options.ts` now owns the transport options and
  wrapper resolution both executors share, which collapsed the `executor <-> anyapi/executor` clone
  pair; `ExecutorOptions extends TransportOptionInput`. Verified: `test:wrap` 55/55, `test:anyapi` 17/17.
- **Harvester split** - `harvester/markdown.ts` 252 -> 202: extraction is `extract()`, the notes/cap
  and the front matter are small functions, and the four Turndown rules live in `turndown-rules.ts`.
  Verified: `test:markdown` 20/20, `test:harvest` 4/4.
- **Bridge transport split** - `bridge/http-plumbing.ts` owns logging (with secret redaction), CORS,
  the body reader and the JSON responder; `http-bridge.ts` is 202 lines of named phases
  (`blockedByHumanControl`, `dispatchRoute`, `sendRouteError`, `wireServerEvents`). Verified live:
  CORS, OPTIONS 204, unknown route 404, non-JSON body, 409 HUMAN_CONTROL + GET still allowed, resume,
  plus `test:harvest` and `test:decide` 23/23.
- **Context menu split** - `menu/context-menu.ts`: spellcheck, selection/editing, link, image and
  navigation sections, so no function is over budget.
- **Recording files split** - `recording/files.ts` owns naming, writing and listing; the service keeps
  configuration and the renderer handshake. Verified against a temp directory: name shape, slug cap,
  bytes/seconds/speedup, newest-first order, limit, non-webm filtering.
- **Settings stores share one file helper** - `src/main/settings/json-file.ts` owns the fail-open
  read and atomic replace; eight stores (shadow-walk, zoom, tools, media, research, experimental,
  jev, anchor-store) use it instead of copy-pasting the sequence. Duplicates 1,791 -> 1,727 (3.7%).
- **Issue #8 fixed** - `tsx` is a devDependency and 25 test scripts that import TS sources run
  under `node --import tsx`; `test:shadow:unit` went from a module-resolution crash to 7/7.
- **Issue #9 fixed** - `/decide` forwards the guard verdict (`NO_DECISION`, accepted/fallback/
  exhausted/reasons) instead of raising a banner; the sensitive-gate branch keeps its automatic
  hand-off. `test:decide` is 23/23.
- **Issue #7 fixed** - `fill_form` no longer injects TypeScript casts; regression test
  `npm run test:forms`.

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
- **P1 #4 in progress** - `browser-chassis.ts` is down from 4,816 to ~4,265 lines:
  - `HumanControl` (`src/main/input/human-control.ts`) - explicit takeover state, hooks for
    HUD/log/focus. Verified live: takeover -> 409 on mutations -> resume -> 200.
  - `ZoomRuntime` (`src/main/zoom/runtime.ts`) - compensate/native policy, step and exact
    factors, rendered CSS/physical proportions, emulation pinning. Verified live: step, 1.5x,
    reset, and the emulated viewport pin.
  - `screenshot-store.ts` (`src/main/snapshots/`) - capture folder + pruning. The extraction
    surfaced a real bug: cleanup only matched `.png` while jpeg is the default format, so 394
    orphaned jpegs had accumulated. Now both formats prune; the live pass removed 380 files.
  - Next slices: sidebar/collab mode, research settings, capture, consent.
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
